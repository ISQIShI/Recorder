import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { checkDocs } from './check-docs.mjs';

async function fixture(t) {
  const prefix = join(resolve(tmpdir()), 'recorder-doc-scope-');
  const root = await mkdtemp(prefix);
  t.after(async () => {
    if (!resolve(root).startsWith(prefix) || resolve(root) === resolve(tmpdir())) throw new Error('Unsafe test cleanup');
    await rm(root, { recursive: true, force: true });
  });
  const git = args => execFileSync('git', ['-c', 'user.name=Doc Check Test', '-c', 'user.email=docs@example.invalid', '-c', 'commit.gpgSign=false', ...args],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
  const put = async (path, body) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), body); };
  const commit = () => { git(['add', '--all']); git(['commit', '-qm', 'test: update documentation fixture']); return git(['rev-parse', 'HEAD']); };
  git(['init', '--quiet', '-b', 'main']);
  await put('README.md', '[Documents](docs/README.md)\n');
  await put('docs/README.md', '[A](a.md)\n[B](b.md)\n');
  await put('docs/a.md', '# A\n');
  await put('docs/b.md', '# Unrelated historical document\n```\n');
  const base = commit();
  git(['update-ref', 'refs/remotes/origin/main', base]);
  return { root, git, put, commit, base };
}

test('only changed documents and navigation are checked; unrelated broken prose is not audited', async t => {
  const f = await fixture(t);
  await f.put('docs/a.md', '# Updated A\n');
  const result = await checkDocs({ root: f.root, base: f.base });
  assert.deepEqual(result.files, ['README.md', 'docs/README.md', 'docs/a.md']);
  assert.deepEqual(result.errors, []);
  await f.put('docs/a.md', Buffer.from([0xff, 0xfe]));
  assert.ok((await checkDocs({ root: f.root, files: ['docs/a.md'] })).errors.some(error => error.includes('invalid UTF-8')));
});

test('untracked and staged documents require navigation; explicit paths and spaces are supported', async t => {
  const f = await fixture(t);
  await f.put('docs/new note.md', '# New\n');
  assert.ok((await checkDocs({ root: f.root, base: f.base })).errors.some(error => error.includes('absent from navigation')));
  await f.put('docs/README.md', '[A](a.md)\n[B](b.md)\n[New](<new note.md>)\n');
  f.git(['add', 'docs/new note.md', 'docs/README.md']);
  assert.deepEqual((await checkDocs({ root: f.root, base: f.base })).errors, []);
  assert.deepEqual((await checkDocs({ root: f.root, files: ['docs/new note.md'] })).errors, []);
  await f.put('.codex/private.md', '```\n');
  assert.ok(!(await checkDocs({ root: f.root, base: f.base })).files.some(path => path.startsWith('.codex/')));
});

test('renames check incoming links, including unchanged referrers outside the owning directory', async t => {
  const f = await fixture(t);
  await f.put('notes.md', '[A](docs/a.md)\n');
  const base = f.commit();
  await rename(join(f.root, 'docs/a.md'), join(f.root, 'docs/moved.md'));
  await f.put('docs/README.md', '[A](moved.md)\n[B](b.md)\n');
  let result = await checkDocs({ root: f.root, base });
  assert.ok(result.files.includes('notes.md'));
  assert.ok(result.errors.some(error => error.includes('notes.md: missing docs/a.md')));
  await f.put('notes.md', '[A](docs/moved.md)\n');
  result = await checkDocs({ root: f.root, base });
  assert.deepEqual(result.errors, []);
});

test('removing a navigation entry checks the orphaned document without checking all siblings', async t => {
  const f = await fixture(t);
  await f.put('docs/README.md', '[B](b.md)\n');
  const result = await checkDocs({ root: f.root, base: f.base });
  assert.ok(result.files.includes('docs/a.md'));
  assert.ok(!result.files.includes('docs/b.md'));
  assert.ok(result.errors.some(error => error.includes('docs' + sep + 'a.md: absent from navigation')));
});

test('comparison includes every branch commit plus worktree changes, rather than only HEAD^', async t => {
  const f = await fixture(t);
  await f.put('docs/a.md', '# Branch update\n'); f.commit();
  await f.put('backend/README.md', '# Backend\n');
  await f.put('backend/src/task.ts', 'export {};\n'); f.commit();
  const result = await checkDocs({ root: f.root });
  assert.equal(result.base, f.base);
  assert.ok(result.files.includes('docs/a.md'));
  assert.ok(result.files.includes('backend/README.md'));
  assert.ok(!result.files.includes('docs/b.md'));
  assert.deepEqual(result.errors, []);
  // A push event's explicit before SHA works even when origin/main has already advanced.
  f.git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  assert.ok((await checkDocs({ root: f.root, base: f.base })).files.includes('docs/a.md'));
});

test('bad scope inputs fail instead of silently falling back to a full scan', async t => {
  const f = await fixture(t);
  await assert.rejects(checkDocs({ root: f.root, base: 'missing-base' }), /Git scope lookup failed/);
  await assert.rejects(checkDocs({ root: f.root, files: ['../outside.md'] }), /outside/);
  await assert.rejects(checkDocs({ root: f.root, files: ['README.md'], base: f.base }), /not both/);
  assert.ok((await checkDocs({ root: f.root, files: ['absent.md'] })).errors.some(error => error.includes('missing requested path')));
});
