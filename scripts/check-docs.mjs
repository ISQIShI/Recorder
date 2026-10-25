import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative, basename } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const excluded = new Set(['node_modules', '.git', '.pnpm-store', '.tmp', '.cache', 'dist', 'artifacts', 'native']);
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith('.md')) files.push(path);
  }
}
await collect(root);
const errors = [];
const indexed = new Set();
let links = 0;
for (const path of files) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path)); }
  catch { errors.push(relative(root, path) + ': invalid UTF-8'); continue; }
  if (text.includes('\uFFFD')) errors.push(relative(root, path) + ': replacement character');
  if ((text.match(/^\s*```/gm)?.length ?? 0) % 2) errors.push(relative(root, path) + ': unbalanced code fence');
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    links++;
    const resolved = resolve(dirname(path), target);
    try { await stat(resolved); } catch { errors.push(relative(root, path) + ': missing ' + target); }
    if (['README.md', 'AGENTS.md'].includes(basename(path))) indexed.add(resolved);
  }
}
for (const path of files) {
  if (path.startsWith(resolve(root, 'docs')) && basename(path) !== 'README.md' && !indexed.has(path)) errors.push(relative(root, path) + ': absent from navigation');
}
console.log(JSON.stringify({ files: files.length, internalLinks: links, errors }, null, 2));
if (errors.length) process.exitCode = 1;
