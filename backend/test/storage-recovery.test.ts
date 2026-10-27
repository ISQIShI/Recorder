import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { mkdtemp, readFile, writeFile, rm, symlink, link, chmod, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { once } from 'node:events';
import * as ownership from '../dist/plugins/database-ownership.js';
import * as database from '../dist/plugins/database.js';
import * as migrations from '../dist/plugins/migrations.js';
import * as recovery from '../dist/plugins/recovery-points.js';
import { installedMigrations } from '../dist/data/migration-manifest.js';
import type { Migration, RecoveryPoint } from '../dist/domain.js';

const initial: Migration = { namespace: 'sample', revision: 1, packageVersion: 'fixture-1',
  sql: 'CREATE TABLE sample(id INTEGER PRIMARY KEY, body TEXT);--> statement-breakpoint\nCREATE TABLE child(parent INTEGER REFERENCES sample(id));' };
const next: Migration = { namespace: 'sample', revision: 2, packageVersion: 'fixture-2', sql: 'ALTER TABLE sample ADD COLUMN extra TEXT;' };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function temp() {
  const path = await mkdtemp(join(tmpdir(), 'recorder-t02-'));
  return { path, async cleanup() {
    const target = resolve(path), parent = resolve(tmpdir());
    assert.equal(dirname(target), parent); assert.ok(basename(target).startsWith('recorder-t02-'));
    await rm(target, { recursive: true, force: true });
  } };
}
async function fixture(steps = [initial, next], applied = [initial]) {
  const dir = await temp(), filename = join(dir.path, 'source.sqlite'), ctx = new Context();
  const sources = [];
  for (let i = 0; i < steps.length; i++) {
    const { sql, ...step } = steps[i]!, file = join(dir.path, i + '.sql');
    await writeFile(file, sql); sources.push({ ...step, file: pathToFileURL(file).href });
  }
  try {
    const owner = await ctx.plugin(ownership, { filename });
    const db = await ctx.plugin(database, { filename });
    migrations.applyMigrations(ctx.recorderDatabase.raw, applied);
    const planner = await ctx.plugin(migrations, { sources, mode: 'inspect' });
    const points = await ctx.plugin(recovery);
    return { dir, filename, ctx, owner, db, planner, points, async cleanup() { await ctx.fiber.dispose(); await dir.cleanup(); } };
  } catch (error) { await ctx.fiber.dispose(); await dir.cleanup(); throw error; }
}
type Message = { event: string; code?: string; filename?: string; controlFile?: string; events?: string[]; open?: boolean; cause?: string };
function host(filename: string, mode = 'hold', dataDir?: string) {
  const child = spawn(process.execPath, ['backend/test/fixtures/storage-host.mjs', filename, mode, ...(dataDir ? [dataDir] : [])], {
    cwd: new URL('../../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  const messages: Message[] = [], waiters = new Set<() => void>(); let output = '';
  child.stdout!.on('data', value => { output += value; }); child.stderr!.on('data', value => { output += value; });
  child.on('message', value => { messages.push(value as Message); for (const waiter of waiters) waiter(); });
  const exit = once(child, 'exit');
  return { child, exit, wait(event: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`Child never reported ${event}: ${output}`)); }, 20000);
      function check() { const found = messages.find(message => message.event === event); if (!found) return; clearTimeout(timer); waiters.delete(check); resolve(found); }
      waiters.add(check); check();
    });
  }, async stop() { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exit; } };
}
async function rejected(filename: string, mode = 'hold', dataDir?: string) {
  const peer = host(filename, mode, dataDir);
  try { const result = await peer.wait('rejected'); await peer.exit; return result; } finally { await peer.stop(); }
}

test('two actual processes contend before opening the business database, release normally and after forced termination', async () => {
  const dir = await temp(), filename = join(dir.path, 'library.sqlite'); let first: ReturnType<typeof host> | undefined, second: ReturnType<typeof host> | undefined;
  try {
    first = host(filename); const ready = await first.wait('ready');
    assert.equal(ready.filename, fs.realpathSync.native(filename)); assert.ok(ready.controlFile);
    assert.equal((await rejected(filename)).code, 'DATABASE_BUSY');
    first.child.send('close'); await first.wait('closed'); await first.exit;
    assert.ok(fs.existsSync(ready.controlFile!), 'Control file is retained, not deleted on release');
    second = host(filename); await second.wait('ready'); await second.stop();
    const afterCrash = host(filename);
    try { await afterCrash.wait('ready'); afterCrash.child.send('close'); await afterCrash.wait('closed'); await afterCrash.exit; } finally { await afterCrash.stop(); }
  } finally { await first?.stop(); await second?.stop(); await dir.cleanup(); }
});

test('cross-process teardown keeps ownership until registered database work and the real database handle finish', async () => {
  const dir = await temp(), filename = join(dir.path, 'library.sqlite'), first = host(filename);
  try {
    await first.wait('ready'); first.child.send('use'); await first.wait('using');
    first.child.send('close'); await first.wait('closing');
    assert.equal((await rejected(filename)).code, 'DATABASE_BUSY');
    first.child.send('finish'); const closed = await first.wait('closed'); await first.exit;
    assert.deepEqual(closed.events, ['use-finished', 'database-closed', 'ownership-closed']);
  } finally { await first.stop(); await dir.cleanup(); }
});

test('relative filenames, distinct dataDirs and real directory symlink/junction aliases share ownership', async () => {
  const dir = await temp(), real = join(dir.path, 'real'), alias = join(dir.path, 'alias'); fs.mkdirSync(real);
  const filename = join(real, 'library.sqlite'); const first = host(filename, 'application', join(dir.path, 'first-data'));
  try {
    await first.wait('ready'); await symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await rejected(join(alias, 'library.sqlite'), 'application', join(dir.path, 'other-data'))).code, 'DATABASE_BUSY');
    assert.equal((await rejected(relative(process.cwd(), filename))).code, 'DATABASE_BUSY');
    assert.equal(fs.existsSync(join(dir.path, 'other-data', 'setup-code.txt')), false);
  } finally { await first.stop(); await dir.cleanup(); }
});

test('a real unfinished iterator prevents close and retains cross-process ownership until a successful close retry', async () => {
  const dir = await temp(), filename = join(dir.path, 'library.sqlite'), first = host(filename, 'iterator');
  try {
    await first.wait('ready'); first.child.send('close');
    const failure = await first.wait('close-failed');
    assert.equal(failure.code, 'DATABASE_CLOSE_FAILED'); assert.equal(failure.open, true);
    assert.match(failure.cause!, /busy|executing/i);
    assert.equal((await rejected(filename)).code, 'DATABASE_BUSY');
    first.child.send('finish-iterator'); const closed = await first.wait('closed'); await first.exit;
    assert.deepEqual(closed.events, ['database-closed', 'ownership-closed']);
    const peer = host(filename);
    try { await peer.wait('ready'); peer.child.send('close'); await peer.wait('closed'); await peer.exit; }
    finally { await peer.stop(); }
  } finally { await first.stop(); await dir.cleanup(); }
});

test('hard links, control-file links and unsupported network/URI paths are explicitly refused', async () => {
  const dir = await temp(), filename = join(dir.path, 'library.sqlite');
  fs.writeFileSync(filename, ''); await link(filename, join(dir.path, 'alias.sqlite'));
  try {
    for (const path of [filename, join(dir.path, 'alias.sqlite'), 'file:database.sqlite', ...(process.platform === 'win32' ? ['\\\\server\\share\\database.sqlite', filename + ':stream'] : [])]) {
      const ctx = new Context(); try { await assert.rejects(Promise.resolve(ctx.plugin(ownership, { filename: path })), { code: 'PATH_UNSUPPORTED' }); } finally { await ctx.fiber.dispose(); }
    }
    const target = join(dir.path, 'target'), path = join(dir.path, 'other.sqlite'); fs.writeFileSync(target, ''); await link(target, path + '.recorder-lock.sqlite');
    const ctx = new Context(); try { await assert.rejects(Promise.resolve(ctx.plugin(ownership, { filename: path })), { code: 'PATH_UNSUPPORTED' }); } finally { await ctx.fiber.dispose(); }
  } finally { await dir.cleanup(); }
});

test('in-memory providers remain isolated and cannot create persistent recovery points', async () => {
  const a = new Context(), b = new Context();
  try {
    for (const ctx of [a, b]) { await ctx.plugin(ownership, { filename: ':memory:' }); await ctx.plugin(database, { filename: ':memory:' }); }
    a.recorderDatabase.raw.exec('CREATE TABLE only_a(id INTEGER)');
    assert.equal(b.recorderDatabase.raw.prepare("SELECT name FROM sqlite_schema WHERE name='only_a'").get(), undefined);
    await a.plugin(migrations, { sources: [], mode: 'inspect' });
    await assert.rejects(Promise.resolve(a.plugin(recovery)), { code: 'PATH_UNSUPPORTED' });
  } finally { await a.fiber.dispose(); await b.fiber.dispose(); }
});

test('WAL-aware native backup seals a private, complete recovery set and leaves source rows and pending schema untouched', async () => {
  const f = await fixture();
  try {
    const raw = f.ctx.recorderDatabase.raw; raw.pragma('wal_autocheckpoint=0');
    raw.prepare('INSERT INTO sample VALUES(?,?)').run(17, 'isolated secret body'); raw.prepare('INSERT INTO child VALUES(?)').run(17);
    assert.ok(fs.statSync(f.filename + '-wal').size > 0);
    const plan = f.ctx.recorderMigrationPlanner.inspect(), point = await f.ctx.recorderRecoveryPoints.create(plan.digest);
    const verified = await f.ctx.recorderRecoveryPoints.verify(point.id);
    assert.equal(verified.manifestDigest, point.manifestDigest); assert.equal(verified.manifest.source.planDigest, plan.digest);
    assert.equal(verified.manifest.materials.length, 2); assert.equal(verified.manifest.executableArchived, false);
    assert.ok(verified.manifest.versions.sqlite); assert.ok(verified.manifest.versions.betterSqlite3);
    // Even readonly inspection can create WAL/SHM beside a WAL-mode file. Inspect an exact
    // isolated copy so this data assertion does not mutate the sealed recovery directory.
    const inspection = join(f.dir.path, 'inspect.sqlite'); fs.copyFileSync(join(point.directory, 'database.sqlite'), inspection);
    assert.equal(hash(await readFile(inspection)), point.manifest.snapshot.digest);
    const snap = new Database(inspection, { readonly: true });
    try { assert.deepEqual(snap.prepare('SELECT * FROM sample').all(), [{ id: 17, body: 'isolated secret body' }]); } finally { snap.close(); }
    assert.deepEqual(raw.prepare('SELECT * FROM sample').all(), [{ id: 17, body: 'isolated secret body' }]);
    assert.equal((raw.pragma('table_info(sample)') as unknown[]).length, 2);
    const list = await f.ctx.recorderRecoveryPoints.list(); assert.equal(list.valid.length, 1); assert.deepEqual(list.incomplete, []);
    for (const suffix of ['-wal', '-shm', '-journal']) assert.equal(fs.existsSync(join(point.directory, 'database.sqlite') + suffix), false);
    if (process.platform === 'linux') assert.equal(fs.statSync(point.directory).mode & 0o077, 0);
  } finally { await f.cleanup(); }
});

test('verify rejects unsealed WAL business rows even when the sealed main-file hash is unchanged', async () => {
  const f = await fixture(); let writer: Database.Database | undefined;
  try {
    f.ctx.recorderDatabase.raw.prepare('INSERT INTO sample VALUES(?,?)').run(1, 'sealed row');
    const point = await f.ctx.recorderRecoveryPoints.create(f.ctx.recorderMigrationPlanner.inspect().digest);
    const filename = join(point.directory, 'database.sqlite');
    // Establish a valid sealed WAL-mode main file before introducing unsealed WAL transactions.
    const setup = new Database(filename);
    try { setup.pragma('journal_mode=WAL'); } finally { setup.close(); }
    await refreshSnapshotHash(point);
    await f.ctx.recorderRecoveryPoints.verify(point.id);
    const mainHash = hash(await readFile(filename));
    writer = new Database(filename); writer.pragma('wal_autocheckpoint=0');
    writer.prepare('INSERT INTO sample VALUES(?,?)').run(2, 'unsealed WAL row');
    assert.ok(fs.statSync(filename + '-wal').size > 0);
    assert.equal(hash(await readFile(filename)), mainHash, 'The manifest-bound main bytes have not changed');
    const readonly = new Database(filename, { readonly: true, fileMustExist: true });
    try { assert.deepEqual(readonly.prepare('SELECT body FROM sample ORDER BY id').all(), [{ body: 'sealed row' }, { body: 'unsealed WAL row' }]); }
    finally { readonly.close(); }
    await assert.rejects(f.ctx.recorderRecoveryPoints.verify(point.id), { code: 'RECOVERY_INVALID' });
    const listed = await f.ctx.recorderRecoveryPoints.list();
    assert.equal(listed.valid.length, 0); assert.deepEqual(listed.invalid, [{ id: point.id, code: 'RECOVERY_INVALID' }]);
    assert.equal(hash(await readFile(filename)), mainHash, 'Verification must not checkpoint the unsealed WAL');
    assert.ok(fs.existsSync(filename + '-wal'), 'Verification must not remove unsealed sidecars');
  } finally { writer?.close(); await f.cleanup(); }
});

test('snapshot preserves existing identity, session and record values with the original production migration SQL', async () => {
  const steps = installedMigrations.map(({ file, ...step }) => ({ ...step, sql: fs.readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8') }));
  const f = await fixture(steps, steps);
  try {
    const raw = f.ctx.recorderDatabase.raw;
    raw.exec("INSERT INTO core_instance VALUES('isolated-instance',1); INSERT INTO identity_users VALUES('owner','owner','isolated-password-hash',1,1)");
    raw.prepare('INSERT INTO identity_sessions VALUES(?,?,?,?,?,?,?,?)').run('session','owner','isolated-token-hash','native','fixture-device',1,999999,null);
    raw.prepare('INSERT INTO records_entries(id,owner_id,request_id,request_hash,title,body,format,format_version,revision,origin_instance_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('record','owner','request','request-hash','title','body','plain',1,7,'isolated-instance',1,2);
    const point = await f.ctx.recorderRecoveryPoints.create(f.ctx.recorderMigrationPlanner.inspect().digest);
    const snap = new Database(join(point.directory, 'database.sqlite'), { readonly: true });
    try { for (const table of ['identity_users','identity_sessions','records_entries','core_instance','recorder_migrations']) assert.deepEqual(snap.prepare('SELECT * FROM ' + table).all(), raw.prepare('SELECT * FROM ' + table).all()); }
    finally { snap.close(); }
  } finally { await f.cleanup(); }
});

test('incomplete snapshots, ENOSPC and archive/sealing write failures never satisfy the upgrade prerequisite', async t => {
  const f = await fixture();
  try {
    const raw = f.ctx.recorderDatabase.raw, before = f.ctx.recorderMigrationPlanner.inspect(), service = f.ctx.recorderRecoveryPoints;
    t.mock.method(raw, 'backup', async (path: string) => { await writeFile(path, 'partial snapshot'); throw Object.assign(new Error('controlled disk-full failure'), { code: 'ENOSPC' }); });
    await assert.rejects(service.create(before.digest), { code: 'RECOVERY_FAILED' }); t.mock.restoreAll();
    let list = await service.list(); assert.equal(list.valid.length, 0); assert.equal(list.incomplete.length, 1);
    assert.equal(f.ctx.recorderMigrationPlanner.inspect().digest, before.digest);
    const originalOpen = fs.openSync;
    t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
      if (String(args[0]).includes('.pending-') && String(args[0]).endsWith('.sql')) throw Object.assign(new Error('controlled material write failure'), { code: 'ENOSPC' });
      return originalOpen(...args);
    });
    syncBuiltinESMExports();
    await assert.rejects(service.create(before.digest), { code: 'RECOVERY_FAILED' }); t.mock.restoreAll(); syncBuiltinESMExports();
    const originalRename = fs.renameSync;
    t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => { if (String(from).includes('.pending-')) throw Object.assign(new Error('controlled sealing denial'), { code: 'EACCES' }); return originalRename(from, to); });
    syncBuiltinESMExports();
    await assert.rejects(service.create(before.digest), { code: 'RECOVERY_FAILED' }); t.mock.restoreAll(); syncBuiltinESMExports();
    list = await service.list(); assert.equal(list.valid.length, 0); assert.equal(list.incomplete.length, 3);
    for (const pending of list.incomplete) await assert.rejects(service.verify(pending), { code: 'RECOVERY_INVALID' });
    assert.equal(f.ctx.recorderMigrationPlanner.inspect().digest, before.digest);
    assert.equal((raw.pragma('table_info(sample)') as unknown[]).length, 2);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await f.cleanup(); }
});

test('native backup cancellation on provider disposal leaves only an incomplete point and an open owned source', async t => {
  const f = await fixture();
  try {
    const raw = f.ctx.recorderDatabase.raw, originalBackup = raw.backup.bind(raw), service = f.ctx.recorderRecoveryPoints;
    let withdrawing: Promise<void> | undefined;
    t.mock.method(raw, 'backup', (filename: string, options: Database.BackupOptions) => originalBackup(filename, { progress(info) {
      if (!withdrawing) withdrawing = f.points.dispose();
      options.progress?.(info);
      return 1;
    } }));
    await assert.rejects(service.create(f.ctx.recorderMigrationPlanner.inspect().digest), { code: 'RECOVERY_CANCELLED' });
    await withdrawing;
    assert.equal(raw.open, true); assert.equal((await rejected(f.filename)).code, 'DATABASE_BUSY');
    assert.equal((await readdir(f.filename + '.recovery-points')).filter(name => !name.startsWith('.pending-')).length, 0);
  } finally { t.mock.restoreAll(); await f.cleanup(); }
});

test('an archive damaged after a successful native backup is rejected before the seal is published', async t => {
  const f = await fixture();
  try {
    const raw = f.ctx.recorderDatabase.raw, originalBackup = raw.backup.bind(raw);
    t.mock.method(raw, 'backup', async (filename: string, options: Database.BackupOptions) => {
      const result = await originalBackup(filename, options);
      await writeFile(join(dirname(filename), 'materials', '000000.sql'), 'damaged archived material');
      return result;
    });
    await assert.rejects(f.ctx.recorderRecoveryPoints.create(f.ctx.recorderMigrationPlanner.inspect().digest), { code: 'RECOVERY_INVALID' });
    assert.equal((await f.ctx.recorderRecoveryPoints.list()).valid.length, 0);
    assert.equal((raw.pragma('table_info(sample)') as unknown[]).length, 2);
  } finally { t.mock.restoreAll(); await f.cleanup(); }
});

test('a WAL sidecar introduced after native backup prevents sealing and remains an incomplete recovery point', async t => {
  const f = await fixture(); let writer: Database.Database | undefined;
  try {
    const raw = f.ctx.recorderDatabase.raw, originalBackup = raw.backup.bind(raw);
    t.mock.method(raw, 'backup', async (filename: string, options: Database.BackupOptions) => {
      const result = await originalBackup(filename, options);
      writer = new Database(filename); writer.pragma('journal_mode=WAL'); writer.pragma('wal_autocheckpoint=0');
      writer.prepare('INSERT INTO sample VALUES(?,?)').run(9, 'unsealed backup row');
      return result;
    });
    await assert.rejects(f.ctx.recorderRecoveryPoints.create(f.ctx.recorderMigrationPlanner.inspect().digest), { code: 'RECOVERY_INVALID' });
    const listed = await f.ctx.recorderRecoveryPoints.list();
    assert.equal(listed.valid.length, 0); assert.equal(listed.incomplete.length, 1);
    assert.equal(fs.existsSync(join(f.filename + '.recovery-points', listed.incomplete[0]!, 'seal.json')), false);
    assert.deepEqual(raw.prepare('SELECT * FROM sample').all(), []);
  } finally { writer?.close(); t.mock.restoreAll(); await f.cleanup(); }
});

test('changed confirmation or incomplete retained migration materials cannot create a usable recovery point', async () => {
  const f = await fixture();
  try {
    const before = f.ctx.recorderMigrationPlanner.inspect(); await writeFile(join(f.dir.path, '1.sql'), next.sql + '\n');
    await assert.rejects(f.ctx.recorderRecoveryPoints.create(before.digest), { code: 'STALE_PLAN' });
    assert.equal(fs.existsSync(f.filename + '.recovery-points'), false);
    const raw = f.ctx.recorderDatabase.raw;
    migrations.applyMigrations(raw, [{ namespace: 'removed', revision: 1, sql: 'CREATE TABLE removed(id INTEGER)' }]);
    await assert.rejects(f.ctx.recorderRecoveryPoints.create(f.ctx.recorderMigrationPlanner.inspect().digest), { code: 'MATERIALS_UNAVAILABLE' });
    assert.equal(fs.existsSync(f.filename + '.recovery-points'), false);
  } finally { await f.cleanup(); }
});

test('verify rejects modified manifest, SQL and snapshot checksums instead of trusting sealed directory names', async () => {
  const f = await fixture();
  try {
    const service = f.ctx.recorderRecoveryPoints, plan = f.ctx.recorderMigrationPlanner.inspect();
    for (const target of ['manifest.json', 'materials/000000.sql', 'database.sqlite']) {
      const point = await service.create(plan.digest), path = join(point.directory, target);
      fs.appendFileSync(path, 'tampered'); await assert.rejects(service.verify(point.id), { code: 'RECOVERY_INVALID' });
    }
    const list = await service.list(); assert.equal(list.valid.length, 0); assert.equal(list.invalid.length, 3);
    await assert.rejects(service.verify('../source.sqlite'), { code: 'RECOVERY_INVALID' });
  } finally { await f.cleanup(); }
});

async function refreshSnapshotHash(point: RecoveryPoint) {
  const file = join(point.directory, 'database.sqlite'); point.manifest.snapshot.digest = hash(await readFile(file)); point.manifest.snapshot.bytes = fs.statSync(file).size;
  const body = JSON.stringify(point.manifest); await writeFile(join(point.directory, 'manifest.json'), body);
  await writeFile(join(point.directory, 'seal.json'), JSON.stringify({ formatVersion: 1, manifestDigest: hash(body) }));
}
test('verification runs SQLite integrity, foreign-key and ledger checks even when file checksums match', async () => {
  const f = await fixture();
  try {
    const raw = f.ctx.recorderDatabase.raw; raw.exec("INSERT INTO sample VALUES(1,'keep'); INSERT INTO child VALUES(1)");
    for (const kind of ['foreign-key', 'ledger', 'corrupt']) {
      const point = await f.ctx.recorderRecoveryPoints.create(f.ctx.recorderMigrationPlanner.inspect().digest), filename = join(point.directory, 'database.sqlite');
      if (kind === 'corrupt') await writeFile(filename, 'isolated corrupt snapshot');
      else { const snap = new Database(filename); try { snap.pragma('foreign_keys=OFF'); snap.exec(kind === 'foreign-key' ? 'UPDATE child SET parent=999' : 'UPDATE recorder_migrations SET applied_at=applied_at+1'); } finally { snap.close(); } }
      await refreshSnapshotHash(point); await assert.rejects(f.ctx.recorderRecoveryPoints.verify(point.id), { code: 'RECOVERY_INVALID' });
    }
    assert.deepEqual(raw.prepare('SELECT * FROM child').all(), [{ parent: 1 }]);
  } finally { await f.cleanup(); }
});

test('ownership withdrawal waits for an in-flight snapshot and its database before a second process can acquire', async t => {
  const f = await fixture(), entered = deferred(), finish = deferred();
  try {
    const raw = f.ctx.recorderDatabase.raw, service = f.ctx.recorderRecoveryPoints, backup = raw.backup.bind(raw);
    t.mock.method(raw, 'backup', async (filename: string, options: Database.BackupOptions) => { entered.resolve(); await finish.promise; return backup(filename, options); });
    const creating = service.create(f.ctx.recorderMigrationPlanner.inspect().digest); const rejectedCreate = assert.rejects(creating, error => ['RECOVERY_CANCELLED', 'SERVICE_WITHDRAWN'].includes((error as { code: string }).code));
    await entered.promise; const disposing = f.owner.dispose();
    assert.equal(raw.open, true); assert.equal((await rejected(f.filename)).code, 'DATABASE_BUSY');
    finish.resolve(); await rejectedCreate; await disposing; await f.db.await(); await f.points.await();
    assert.equal(raw.open, false); assert.equal(f.ctx.get('recorderDatabase'), undefined);
    await assert.rejects(service.create('old'), { code: 'SERVICE_WITHDRAWN' });
    const peer = host(f.filename); try { await peer.wait('ready'); } finally { await peer.stop(); }
    assert.equal((await readdir(f.filename + '.recovery-points')).filter(name => !name.startsWith('.pending-')).length, 0);
  } finally { finish.resolve(); t.mock.restoreAll(); await f.cleanup(); }
});

test('Cordis restores dependent providers after ownership replacement and accepts a compatible recovery-service replacement', async () => {
  const f = await fixture();
  try {
    const saved = await f.ctx.recorderRecoveryPoints.create(f.ctx.recorderMigrationPlanner.inspect().digest);
    const previous = f.ctx.recorderRecoveryPoints;
    await f.owner.dispose(); await f.points.await();
    await assert.rejects(previous.verify(saved.id), { code: 'SERVICE_WITHDRAWN' });
    await f.ctx.plugin(ownership, { filename: f.filename }); await f.db.await(); await f.planner.await(); await f.points.await();
    assert.equal((await f.ctx.recorderRecoveryPoints.verify(saved.id)).manifestDigest, saved.manifestDigest);
    await f.points.dispose();
    await f.ctx.plugin({ apply(ctx: Context) { ctx.provide('recorderRecoveryPoints', { async create() { return saved; }, async verify() { return saved; }, async list() { return { valid: [saved], invalid: [], incomplete: [] }; } }); } });
    let observed = '';
    await f.ctx.plugin({ inject: ['recorderRecoveryPoints'], async apply(ctx: Context) { observed = (await ctx.recorderRecoveryPoints.verify(saved.id)).manifestDigest; } });
    assert.equal(observed, saved.manifestDigest);
  } finally { await f.cleanup(); }
});

test('existing permissive recovery roots are rejected without silently changing user permissions', async () => {
  const f = await fixture();
  try {
    const point = await f.ctx.recorderRecoveryPoints.create(f.ctx.recorderMigrationPlanner.inspect().digest), root = dirname(point.directory);
    if (process.platform === 'linux') await chmod(root, 0o755);
    else execFileSync('icacls.exe', [root, '/grant', '*S-1-1-0:(R)'], { windowsHide: true, stdio: 'pipe' });
    await assert.rejects(f.ctx.recorderRecoveryPoints.list(), { code: 'PERMISSION_DENIED' });
    if (process.platform === 'linux') assert.equal(fs.statSync(root).mode & 0o777, 0o755);
  } finally { await f.cleanup(); }
});
