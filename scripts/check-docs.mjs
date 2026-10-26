import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative, basename, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const excluded = new Set(['node_modules', '.git', '.codex', '.agents', '.pnpm-store', '.tmp', '.cache', 'dist', 'artifacts', 'native']);
const isIndex = path => ['README.md', 'AGENTS.md'].includes(basename(path));
const exists = async path => { try { return (await stat(path)).isFile(); } catch { return false; } };
const splitPaths = output => output.split('\0').filter(Boolean);

function linksIn(source, file) {
  return [...source.matchAll(/\]\(([^)]+)\)/g)].flatMap(match => {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    return !target || /^(https?:|mailto:)/.test(target) ? [] : [{ target, path: resolve(dirname(file), target) }];
  });
}

/** Check changed/requested documents and their navigation, without a repository-wide document audit. */
export async function checkDocs({ root, base, files = [] }) {
  root = resolve(root);
  const git = (args, optional = false) => {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
    catch (error) { if (optional && error.status === 1) return ''; throw new Error(`Git scope lookup failed (${args[0]}); provide a valid --base in a checkout with history.`, { cause: error }); }
  };
  const inside = path => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep); };
  const allowed = path => inside(path) && !relative(root, path).split(sep).some(part => excluded.has(part));
  const resolveCommit = ref => {
    if (!ref || ref.startsWith('-')) throw new Error('Invalid document comparison base');
    return git(['rev-parse', '--verify', '--end-of-options', ref + '^{commit}']).trim();
  };
  let comparison = null;
  let changed;
  if (files.length) {
    if (base) throw new Error('Use explicit paths or --base, not both');
    changed = files.map(file => resolve(root, file));
    for (const file of changed) if (!allowed(file)) throw new Error('Requested path is outside the supported workspace scope');
  } else {
    if (base && !/^0+$/.test(base)) comparison = resolveCommit(base);
    else if (!base) {
      const remote = git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'], true).trim();
      const head = resolveCommit('HEAD');
      if (remote) comparison = git(['merge-base', head, remote]).trim();
      if (!comparison || comparison === head) comparison = git(['rev-parse', '--verify', '--quiet', 'HEAD^'], true).trim() || null;
    }
    const committed = comparison
      ? git(['diff', '--name-only', '--no-renames', '-z', comparison, 'HEAD', '--'])
      : git(['diff-tree', '--root', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', 'HEAD', '--']);
    changed = [...new Set([
      ...splitPaths(committed),
      ...splitPaths(git(['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--'])),
      ...splitPaths(git(['ls-files', '--others', '--exclude-standard', '-z'])),
    ])].map(file => resolve(root, file)).filter(allowed);
  }
  const previousText = file => {
    const rel = relative(root, file).split(sep).join('/');
    try { return execFileSync('git', ['show', `${comparison ?? 'HEAD'}:${rel}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
    catch { return ''; } // New files have no previous version.
  };
  const selected = new Set(), errors = [], cache = new Map();
  const read = async file => {
    if (cache.has(file)) return cache.get(file);
    let source;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file)); }
    catch { errors.push(relative(root, file) + ': unreadable or invalid UTF-8'); source = ''; }
    cache.set(file, source); return source;
  };
  const add = async file => {
    if (!allowed(file) || !file.endsWith('.md') || !await exists(file)) return;
    selected.add(file);
    // The owning index and ancestor navigation are related, not every linked document.
    let directory = dirname(file);
    while (inside(directory)) {
      for (const name of ['README.md', 'AGENTS.md']) {
        const index = resolve(directory, name);
        if (allowed(index) && await exists(index)) selected.add(index);
      }
      if (directory === root) break;
      directory = dirname(directory);
    }
  };
  for (const file of changed) {
    if (file.endsWith('.md')) await add(file);
    else {
      // A code change's closest engineering README describes its observable behavior.
      let directory = dirname(file);
      while (inside(directory)) {
        const index = resolve(directory, 'README.md');
        if (await exists(index)) { await add(index); break; }
        if (directory === root) break;
        directory = dirname(directory);
      }
    }
    if (!await exists(file)) {
      if (files.length) errors.push(relative(root, file) + ': missing requested path');
      // Search candidate referrers, then select actual resolved links to the removed path.
      const candidates = splitPaths(git(['grep', '-l', '-z', '-F', '-e', basename(file), '--', '*.md'], true));
      for (const candidate of candidates) {
        const referrer = resolve(root, candidate);
        if (!allowed(referrer)) continue;
        const source = await readFile(referrer, 'utf8');
        if (linksIn(source, referrer).some(link => link.path === file)) await add(referrer);
      }
      if (isIndex(file)) for (const link of linksIn(previousText(file), file)) await add(link.path);
    }
  }
  // Removing an index entry can orphan an unchanged document. Add only the removed targets.
  for (const file of [...selected].filter(isIndex)) {
    const current = new Set(linksIn(await read(file), file).map(link => link.path));
    for (const link of linksIn(previousText(file), file)) if (!current.has(link.path)) await add(link.path);
  }
  const indexed = new Set(); let internalLinks = 0;
  for (const file of [...selected].sort()) {
    const source = await read(file);
    if (source.includes('\uFFFD')) errors.push(relative(root, file) + ': replacement character');
    if ((source.match(/^\s*```/gm)?.length ?? 0) % 2) errors.push(relative(root, file) + ': unbalanced code fence');
    for (const link of linksIn(source, file)) {
      internalLinks++;
      try { await stat(link.path); } catch { errors.push(relative(root, file) + ': missing ' + link.target); }
      if (isIndex(file)) indexed.add(link.path);
    }
  }
  for (const file of selected) {
    if (relative(root, file).startsWith('docs' + sep) && basename(file) !== 'README.md' && !indexed.has(file)) errors.push(relative(root, file) + ': absent from navigation');
  }
  return { mode: 'related', base: comparison, files: [...selected].sort().map(file => relative(root, file).split(sep).join('/')), internalLinks, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2).filter(arg => arg !== '--');
    let base = process.env.RECORDER_DOCS_BASE || undefined;
    const files = [];
    for (let at = 0; at < args.length; at++) {
      if (args[at] === '--base') { if (!args[at + 1]) throw new Error('--base requires a ref'); base = args[++at]; }
      else if (args[at].startsWith('-')) throw new Error('Unknown option: ' + args[at]);
      else files.push(args[at]);
    }
    const result = await checkDocs({ root: resolve(import.meta.dirname, '..'), base, files });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
