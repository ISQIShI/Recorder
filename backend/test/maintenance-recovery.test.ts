import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { createMaintenance } from '../dist/maintenance-profile.js';
import { createApplication } from '../dist/application.js';
import { installedMigrations } from '../dist/data/migration-manifest.js';
import * as ownership from '../dist/plugins/database-ownership.js';
import * as database from '../dist/plugins/database.js';
import * as migrations from '../dist/plugins/migrations.js';
import * as maintenance from '../dist/plugins/maintenance.js';
import type { Migration, MaintenanceRun } from '../dist/domain.js';

const production: Migration[] = installedMigrations.map(({ file, ...step }) => ({ ...step, sql: fs.readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8') }));
const drill: Migration[] = [
  { namespace: 'drill', revision: 1, sql: 'CREATE TABLE drill(id INTEGER PRIMARY KEY, body TEXT);' },
  { namespace: 'drill', revision: 2, sql: 'ALTER TABLE drill ADD COLUMN note TEXT;' },
  { namespace: 'drill', revision: 3, sql: 'CREATE INDEX drill_note ON drill(note);' },
];
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const dataTables = ['core_instance', 'identity_users', 'identity_sessions', 'records_entries'];
function data(raw: Database.Database) { return dataTables.map(table => raw.prepare('SELECT * FROM ' + table).all()); }
async function fixture(empty = false, productionOnly = false) {
  const path = await mkdtemp(join(tmpdir(), 'recorder-t03-')), source = join(path, 'source'), material = join(path, 'materials');
  await mkdir(source); await mkdir(material);
  const filename = join(source, 'source.sqlite'), all = productionOnly ? production : [...production, ...drill], sources = [];
  for (let i = 0; i < all.length; i++) {
    const { sql, ...step } = all[i]!, file = join(material, i + '.sql'); await writeFile(file, sql);
    sources.push({ ...step, file: pathToFileURL(file).href });
  }
  if (!empty) {
    const ctx = new Context();
    try {
      await ctx.plugin(ownership, { filename }); await ctx.plugin(database, { filename });
      const raw = ctx.recorderDatabase.raw;
      migrations.applyMigrations(raw, productionOnly ? production : [...production, drill[0]!]);
      raw.exec("INSERT INTO core_instance VALUES('drill-instance',1); INSERT INTO identity_users VALUES('owner','owner','isolated-password-hash',1,1)");
      raw.prepare('INSERT INTO identity_sessions VALUES(?,?,?,?,?,?,?,?)').run('session','owner','isolated-session-hash','native','drill-device',1,999999,null);
      raw.prepare('INSERT INTO records_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('record','owner','request','request-hash','fixture title','# fixture body','markdown',1,7,'drill-instance',1,2);
      if (!productionOnly) raw.prepare('INSERT INTO drill VALUES(?,?)').run(1, 'preserved fixture');
    } finally { await ctx.fiber.dispose(); }
  }
  const config = { filename, sources, dataDir: source }, configFile = join(path, 'host.json'); await writeFile(configFile, JSON.stringify(config));
  let ctx: Awaited<ReturnType<typeof createMaintenance>> | undefined;
  return { path, filename, source, sources, config, configFile,
    async open() { ctx = await createMaintenance(config); return ctx; },
    async close() { await ctx?.fiber.dispose(); ctx = undefined; },
    async cleanup() {
      await ctx?.fiber.dispose(); ctx = undefined;
      const target = resolve(path); assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith('recorder-t03-'));
      await rm(target, { recursive: true, force: true });
    } };
}
async function cli(f: Awaited<ReturnType<typeof fixture>>, command: string, args: string[] = [], input?: string) {
  const child = spawn(process.execPath, ['backend/test/fixtures/maintenance-host.mjs', f.configFile, command, '--database', f.filename, ...args],
    { cwd: new URL('../../', import.meta.url), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '', answered = false;
  child.stdout.on('data', chunk => { output += chunk; if (!answered && input !== undefined && output.includes('anything else cancels:')) { answered = true; child.stdin.end(input + '\n'); } });
  child.stderr.on('data', chunk => { error += chunk; });
  return new Promise<{ code: number | null; output: string; error: string }>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('CLI timeout: ' + output + error)); }, 60000);
    child.on('error', reason => { clearTimeout(timer); reject(reason); });
    child.on('exit', code => { clearTimeout(timer); resolve({ code, output, error }); });
  });
}

test('minimal Loader profile inspects without business services, requires confirmation and preserves data through upgrade and isolated restore', async () => {
  const f = await fixture();
  try {
    const ctx = await f.open(), service = ctx.recorderMaintenance, before = data(ctx.recorderDatabase.raw);
    const inspection = await service.inspect(); assert.equal(inspection.plan.status, 'upgrade-required');
    for (const name of ['recorderMigrations', 'recorderAuth', 'recorderRecords', 'recorderHttp']) assert.equal(ctx.get(name), undefined);
    await assert.rejects(service.upgrade(''), { code: 'CONFIRMATION_REQUIRED' });
    assert.equal(ctx.recorderMaintenanceRuns.read().runs.length, 0);
    await assert.rejects(service.upgrade('0'.repeat(64)), { code: 'STALE_PLAN' });
    const upgraded = await service.upgrade(inspection.plan.digest);
    assert.equal(upgraded.plan.status, 'compatible'); assert.equal(upgraded.state, 'idle');
    assert.deepEqual(data(ctx.recorderDatabase.raw), before);
    assert.equal((ctx.recorderDatabase.raw.pragma('table_info(drill)') as unknown[]).length, 3);
    const runs = ctx.recorderMaintenanceRuns.read().runs; assert.equal(runs.length, 1); assert.equal(runs[0]!.phase, 'complete');
    assert.deepEqual((await service.upgrade(upgraded.plan.digest)).plan.applied, upgraded.plan.applied);
    assert.equal(ctx.recorderMaintenanceRuns.read().runs.length, 1);
    const point = (await ctx.recorderRecoveryPoints.list()).valid[0]!;
    assert.equal(point.manifest.plan.digest, inspection.plan.digest);
    const originalPoint = await readFile(join(point.directory, 'database.sqlite')), sourceData = data(ctx.recorderDatabase.raw);
    const target = join(f.path, 'restored'), restored = await ctx.recorderIsolatedRecovery.restore(point.id, target);
    assert.equal(restored.state, 'isolated'); assert.equal(restored.versions.recorder, point.manifest.versions.recorder);
    assert.equal(hash(await readFile(join(target, 'database.sqlite'))), point.manifest.snapshot.digest);
    assert.equal((await ctx.recorderIsolatedRecovery.verify(target)).state, 'isolated');
    const raw = new Database(join(target, 'database.sqlite'), { readonly: true });
    try {
      assert.deepEqual(data(raw), before);
      assert.deepEqual(raw.prepare('SELECT namespace,revision,digest,applied_at AS appliedAt FROM recorder_migrations ORDER BY namespace,revision').all(), point.manifest.ledger);
      assert.equal((raw.pragma('table_info(drill)') as unknown[]).length, 2);
      assert.deepEqual(raw.pragma('integrity_check'), [{ integrity_check: 'ok' }]); assert.deepEqual(raw.pragma('foreign_key_check'), []);
    } finally { raw.close(); }
    assert.deepEqual(data(ctx.recorderDatabase.raw), sourceData); assert.deepEqual(await readFile(join(point.directory, 'database.sqlite')), originalPoint);
    for (const suffix of ['-wal', '-shm', '-journal']) assert.equal(fs.existsSync(join(point.directory, 'database.sqlite') + suffix), false);
    await assert.rejects(createApplication({ filename: join(target, 'database.sqlite'), dataDir: target, http: { listen: false } }), { code: 'ISOLATED_RECOVERY' });
  } finally { await f.cleanup(); }
});

test('empty initialization needs no old-data recovery point, and subsequent compatible operations retain the completed run', async () => {
  const f = await fixture(true, true);
  try {
    let ctx = await f.open(), plan = (await ctx.recorderMaintenance.inspect()).plan;
    assert.equal(plan.status, 'empty'); assert.equal(ctx.recorderDatabase.raw.prepare<[], { n: number }>('SELECT count(*) AS n FROM sqlite_schema').get()!.n, 0);
    assert.equal((await ctx.recorderMaintenance.upgrade(plan.digest)).plan.status, 'compatible');
    assert.equal(ctx.recorderMaintenanceRuns.read().runs[0]!.recovery, undefined);
    assert.equal((await ctx.recorderRecoveryPoints.list()).valid.length, 0);
    await f.close();
    const app = await createApplication({ filename: f.filename, dataDir: f.source, http: { listen: false } });
    try { assert.equal(app.recorderMigrations.ready, true); } finally { await app.fiber.dispose(); }
    ctx = await f.open(); plan = (await ctx.recorderMaintenance.inspect()).plan;
    assert.equal((await ctx.recorderMaintenance.upgrade('')).plan.digest, plan.digest);
    assert.equal(ctx.recorderMaintenanceRuns.read().runs.length, 1);
  } finally { await f.cleanup(); }
});

test('an already compatible library needs no confirmation, recovery point or maintenance record for a no-op', async () => {
  const f = await fixture(false, true);
  try {
    const ctx = await f.open(), before = data(ctx.recorderDatabase.raw), plan = ctx.recorderMigrationPlanner.inspect();
    assert.equal(plan.status, 'compatible');
    assert.equal((await ctx.recorderMaintenance.upgrade('')).plan.digest, plan.digest);
    assert.deepEqual(data(ctx.recorderDatabase.raw), before);
    assert.equal(fs.existsSync(ctx.recorderMaintenanceRuns.directory), false);
    assert.equal(fs.existsSync(f.filename + '.recovery-points'), false);
  } finally { await f.cleanup(); }
});

test('real CLI rejects missing/stale confirmation and cancellation without changing the ledger', async () => {
  const f = await fixture();
  try {
    const inspected = await cli(f, 'inspect'); assert.equal(inspected.code, 0, inspected.error);
    const plan = JSON.parse(inspected.output.trim()).plan;
    assert.equal((await cli(f, 'upgrade')).code, 2);
    assert.equal((await cli(f, 'upgrade', ['--confirm', '0'.repeat(64)])).code, 2);
    const cancelled = await cli(f, 'upgrade', ['--interactive'], 'cancel'); assert.equal(cancelled.code, 2, cancelled.error);
    assert.match(cancelled.error, /Cancelled/);
    const unchanged = await cli(f, 'inspect'); assert.equal(JSON.parse(unchanged.output.trim()).plan.digest, plan.digest);
    const upgraded = await cli(f, 'upgrade', ['--confirm', plan.digest]); assert.equal(upgraded.code, 0, upgraded.error);
    assert.equal(JSON.parse(upgraded.output.trim()).plan.status, 'compatible');
    assert.equal((await cli(f, 'points')).code, 0);
  } finally { await f.cleanup(); }
});

test('changed materials and a failed recovery prerequisite never execute migration SQL; explicit resume can recover the preserved run', async t => {
  const f = await fixture();
  try {
    const ctx = await f.open(), initial = await ctx.recorderMaintenance.inspect();
    const file = new URL(f.sources[f.sources.length - 1]!.file), sql = await readFile(file, 'utf8');
    await writeFile(file, sql + '\n');
    await assert.rejects(ctx.recorderMaintenance.upgrade(initial.plan.digest), { code: 'STALE_PLAN' });
    assert.equal(ctx.recorderMaintenanceRuns.read().runs.length, 0); await writeFile(file, sql);
    t.mock.method(ctx.recorderRecoveryPoints, 'create', async () => { throw Object.assign(new Error('controlled snapshot failure'), { code: 'RECOVERY_FAILED' }); });
    await assert.rejects(ctx.recorderMaintenance.upgrade(initial.plan.digest), { code: 'RECOVERY_FAILED' });
    assert.equal((ctx.recorderDatabase.raw.pragma('table_info(drill)') as unknown[]).length, 2);
    assert.deepEqual(ctx.recorderMigrationPlanner.inspect().applied, initial.plan.applied);
    const stopped = await ctx.recorderMaintenance.inspect(); assert.equal(stopped.state, 'snapshot-needed');
    await assert.rejects(ctx.recorderMaintenance.upgrade(stopped.plan.digest), { code: 'MAINTENANCE_INCOMPLETE' });
    t.mock.restoreAll();
    assert.equal((await ctx.recorderMaintenance.resume(stopped.plan.digest)).plan.status, 'compatible');
    const pending = join(ctx.recorderMaintenanceRuns.directory, '.pending-orphan'); await writeFile(pending, 'interrupted unpublished record');
    assert.equal((await ctx.recorderMaintenance.inspect()).state, 'manual');
    assert.throws(() => ctx.recorderMaintenanceRuns.assertStartup(), { code: 'MAINTENANCE_INCOMPLETE' });
    assert.ok(fs.existsSync(pending), 'Unknown pending files must be preserved');
  } finally { t.mock.restoreAll(); await f.cleanup(); }
});

test('restoration rejects nonempty, source, ancestor, nested and alias targets; tampered and pending points stay unusable', async t => {
  const f = await fixture();
  try {
    const ctx = await f.open(), point = await ctx.recorderRecoveryPoints.create(ctx.recorderMigrationPlanner.inspect().digest);
    const nonempty = join(f.path, 'occupied'); await mkdir(nonempty); await writeFile(join(nonempty, 'user.txt'), 'preserve this');
    const alias = join(f.path, 'source-alias'); await symlink(f.source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    for (const target of [nonempty, f.source, f.filename, f.path, join(f.source, 'nested'), point.directory, dirname(point.directory), alias, join(alias, 'nested')]) {
      await assert.rejects(ctx.recorderIsolatedRecovery.restore(point.id, target), { code: 'TARGET_UNSAFE' });
    }
    assert.equal(await readFile(join(nonempty, 'user.txt'), 'utf8'), 'preserve this');
    const snapshot = join(point.directory, 'database.sqlite'); await writeFile(snapshot, 'damaged isolated snapshot');
    await assert.rejects(ctx.recorderIsolatedRecovery.restore(point.id, join(f.path, 'tampered-target')), { code: 'RECOVERY_INVALID' });
    assert.equal(fs.existsSync(join(f.path, 'tampered-target')), false);
    t.mock.method(ctx.recorderDatabase.raw, 'backup', async () => { throw new Error('controlled backup interruption'); });
    await assert.rejects(ctx.recorderRecoveryPoints.create(ctx.recorderMigrationPlanner.inspect().digest), { code: 'RECOVERY_FAILED' });
    const pending = (await ctx.recorderRecoveryPoints.list()).incomplete[0]!;
    await assert.rejects(ctx.recorderIsolatedRecovery.restore(pending, join(f.path, 'pending-target')), { code: 'RECOVERY_INVALID' });
    assert.ok(fs.existsSync(join(dirname(point.directory), pending)), 'Pending evidence is retained');
  } finally { t.mock.restoreAll(); await f.cleanup(); }
});

test('failed isolated copies retain an incomplete marker, and target validation refuses unsealed WAL without consuming it', async t => {
  const f = await fixture(); let writer: Database.Database | undefined;
  try {
    const ctx = await f.open(), point = await ctx.recorderRecoveryPoints.create(ctx.recorderMigrationPlanner.inspect().digest);
    const target = join(f.path, 'failed-target'), copy = fs.copyFileSync;
    // Windows runners may expose TEMP through an 8.3 alias; the provider uses the native canonical parent.
    const failedCopy = join(fs.realpathSync.native(f.path), 'failed-target', 'database.sqlite');
    let injected = false;
    const { syncBuiltinESMExports } = await import('node:module');
    t.mock.method(fs, 'copyFileSync', (source: fs.PathLike, destination: fs.PathLike, flags?: number) => {
      if (String(destination) === failedCopy) { injected = true; throw Object.assign(new Error('controlled full target'), { code: 'ENOSPC' }); }
      return copy(source, destination, flags);
    }); syncBuiltinESMExports();
    await assert.rejects(ctx.recorderIsolatedRecovery.restore(point.id, target), { code: 'ENOSPC' });
    assert.ok(injected, 'The failure is injected into the canonical isolated target copy');
    assert.equal(JSON.parse(await readFile(join(target, 'database.sqlite.restore.json'), 'utf8')).state, 'incomplete');
    await assert.rejects(ctx.recorderIsolatedRecovery.verify(target), { code: 'RESTORE_INVALID' });
    t.mock.restoreAll(); syncBuiltinESMExports();
    const complete = join(f.path, 'wal-target'); await ctx.recorderIsolatedRecovery.restore(point.id, complete);
    const filename = join(complete, 'database.sqlite'), sealedHash = hash(await readFile(filename));
    writer = new Database(filename); writer.pragma('wal_autocheckpoint=0');
    writer.prepare('INSERT INTO drill VALUES(?,?)').run(2, 'unsealed target WAL');
    assert.equal(hash(await readFile(filename)), sealedHash);
    await assert.rejects(ctx.recorderIsolatedRecovery.verify(complete), { code: 'RESTORE_INVALID' });
    assert.ok(fs.existsSync(filename + '-wal')); assert.equal(hash(await readFile(filename)), sealedHash);
  } finally { writer?.close(); t.mock.restoreAll(); const { syncBuiltinESMExports } = await import('node:module'); syncBuiltinESMExports(); await f.cleanup(); }
});

test('a failed final validation leaves all commits gated until an explicit validation-only resume', async t => {
  const f = await fixture();
  try {
    const ctx = await f.open(), raw = ctx.recorderDatabase.raw, originalWrite = ctx.recorderMaintenanceRuns.write.bind(ctx.recorderMaintenanceRuns), pragma = raw.pragma.bind(raw);
    let validating = false;
    t.mock.method(ctx.recorderMaintenanceRuns, 'write', (run: MaintenanceRun) => { originalWrite(run); if (run.phase === 'validating') validating = true; });
    t.mock.method(raw, 'pragma', (sql: string, options?: Database.PragmaOptions) => validating && sql === 'integrity_check' ? [{ integrity_check: 'controlled invalid result' }] : pragma(sql, options));
    await assert.rejects(ctx.recorderMaintenance.upgrade(ctx.recorderMigrationPlanner.inspect().digest), { code: 'MANUAL_INTERVENTION' });
    assert.equal(ctx.recorderMaintenanceRuns.read().runs[0]!.phase, 'validating');
    t.mock.restoreAll();
    const state = await ctx.recorderMaintenance.inspect(), ledger = state.plan.applied;
    assert.equal(state.state, 'final-validation'); assert.equal(state.plan.steps.length, 0);
    await assert.rejects(ctx.recorderMaintenance.resume(''), { code: 'CONFIRMATION_REQUIRED' });
    const resumed = await ctx.recorderMaintenance.resume(state.plan.digest);
    assert.deepEqual(resumed.plan.applied, ledger); assert.equal(resumed.state, 'idle');
  } finally { t.mock.restoreAll(); await f.cleanup(); }
});

async function terminateAt(f: Awaited<ReturnType<typeof fixture>>, checkpoint: string) {
  const signal = join(f.path, checkpoint + '.signal');
  const child = spawn(process.execPath, ['backend/test/fixtures/maintenance-host.mjs', f.configFile, '__fault', checkpoint, signal],
    { cwd: new URL('../../', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const exit = new Promise<void>((resolve, reject) => { child.on('exit', () => resolve()); child.on('error', reject); });
  try {
    const deadline = Date.now() + 60000;
    while (!fs.existsSync(signal)) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error('Fault checkpoint missing: ' + checkpoint + '\n' + output);
      await delay(50);
    }
    assert.equal(JSON.parse(await readFile(signal, 'utf8')).phase, checkpoint);
    child.kill('SIGKILL'); await exit;
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exit; }
}

test('actual subprocess termination preserves evidence and reconciles pre/post-commit prefixes before explicitly confirmed continuation', async t => {
  for (const [checkpoint, committed] of [['snapshot', 0], ['before-commit', 0], ['after-commit', 1], ['final-validation', 2]] as const) {
    await t.test(checkpoint, async () => {
      const f = await fixture();
      try {
        await terminateAt(f, checkpoint);
        const ctx = await f.open(), state = await ctx.recorderMaintenance.inspect(), raw = ctx.recorderDatabase.raw;
        assert.equal(state.committed, committed); assert.equal(state.plan.applied.length, 3 + committed);
        assert.equal(state.state, checkpoint === 'snapshot' ? 'snapshot-needed' : checkpoint === 'final-validation' ? 'final-validation' : 'can-continue');
        assert.equal((raw.pragma('table_info(drill)') as unknown[]).length, committed ? 3 : 2);
        if (checkpoint === 'after-commit') assert.equal(state.run!.observed.length, 3, 'Real SQL commit preceded result publication');
        if (checkpoint === 'snapshot') assert.ok((await ctx.recorderRecoveryPoints.list()).incomplete.length > 0);
        const before = data(raw), existingLedger = state.plan.applied;
        await assert.rejects(ctx.recorderMaintenance.resume(''), { code: 'CONFIRMATION_REQUIRED' });
        assert.deepEqual(ctx.recorderMigrationPlanner.inspect().applied, existingLedger);
        await f.close();
        const resumed = await cli(f, 'resume', ['--confirm', state.plan.digest]); assert.equal(resumed.code, 0, resumed.error);
        const next = await f.open(), done = await next.recorderMaintenance.inspect();
        assert.equal(done.state, 'idle'); assert.equal(done.plan.status, 'compatible'); assert.deepEqual(data(next.recorderDatabase.raw), before);
        for (const row of existingLedger) assert.deepEqual(done.plan.applied.find(value => value.namespace === row.namespace && value.revision === row.revision), row);
        assert.equal(next.recorderMaintenanceRuns.read().runs[0]!.phase, 'complete');
      } finally { await f.cleanup(); }
    });
  }
});

test('ordinary application startup rejects an unfinished run even when the entire production schema is already compatible', async () => {
  const f = await fixture(true, true);
  try {
    await terminateAt(f, 'final-validation');
    const status = await cli(f, 'inspect'); assert.equal(status.code, 0, status.error);
    const state = JSON.parse(status.output.trim()); assert.equal(state.plan.status, 'compatible'); assert.equal(state.state, 'final-validation');
    const business = await cli(f, '__business'); assert.equal(business.code, 4); assert.equal(JSON.parse(business.output.trim()).code, 'MAINTENANCE_INCOMPLETE');
    assert.equal(fs.existsSync(join(f.source, 'setup-code.txt')), false);
    const resumed = await cli(f, 'resume', ['--confirm', state.plan.digest]); assert.equal(resumed.code, 0, resumed.error);
    const restarted = await cli(f, '__business'); assert.equal(restarted.code, 0, restarted.output + restarted.error);
    assert.equal(JSON.parse(restarted.output.trim()).started, true);
  } finally { await f.cleanup(); }
});

test('resume refuses changed recovery evidence, materials, old ledger entries and a corrupted run envelope', async t => {
  const f = await fixture();
  try {
    const ctx = await f.open(), executor = ctx.recorderMigrationExecutor, execute = executor.executeStep!.bind(executor);
    let calls = 0;
    t.mock.method(executor as Required<typeof executor>, 'executeStep', (digest: string) => { if (++calls === 2) throw new Error('controlled stop between commits'); return execute(digest); });
    await assert.rejects(ctx.recorderMaintenance.upgrade(ctx.recorderMigrationPlanner.inspect().digest)); t.mock.restoreAll();
    let state = await ctx.recorderMaintenance.inspect(); assert.equal(state.state, 'can-continue'); assert.equal(state.committed, 1);
    const point = (await ctx.recorderRecoveryPoints.list()).valid[0]!, sealFile = join(point.directory, 'seal.json'), seal = await readFile(sealFile);
    await writeFile(sealFile, '{}');
    assert.equal((await ctx.recorderMaintenance.inspect()).state, 'manual');
    await assert.rejects(ctx.recorderMaintenance.resume(state.plan.digest), { code: 'MANUAL_INTERVENTION' }); await writeFile(sealFile, seal);
    const file = new URL(f.sources[f.sources.length - 1]!.file), sql = await readFile(file, 'utf8'); await writeFile(file, sql + '\n');
    assert.equal((await ctx.recorderMaintenance.inspect()).state, 'manual'); await writeFile(file, sql);
    const old = state.plan.applied[0]!;
    ctx.recorderDatabase.raw.prepare('UPDATE recorder_migrations SET applied_at=applied_at+1 WHERE namespace=? AND revision=?').run(old.namespace, old.revision);
    assert.equal((await ctx.recorderMaintenance.inspect()).state, 'manual');
    ctx.recorderDatabase.raw.prepare('UPDATE recorder_migrations SET applied_at=? WHERE namespace=? AND revision=?').run(old.appliedAt, old.namespace, old.revision);
    state = await ctx.recorderMaintenance.inspect(); assert.equal(state.state, 'can-continue');
    const runFile = join(ctx.recorderMaintenanceRuns.directory, state.run!.id + '.json'), envelope = JSON.parse(await readFile(runFile, 'utf8'));
    envelope.run.phase = 'complete'; await writeFile(runFile, JSON.stringify(envelope));
    await assert.rejects(ctx.recorderMaintenance.inspect(), { code: 'RUN_INVALID' });
    await f.close();
    assert.equal((await cli(f, 'inspect')).code, 4);
    const business = await cli(f, '__business'); assert.equal(JSON.parse(business.output.trim()).code, 'RUN_INVALID');
  } finally { t.mock.restoreAll(); await f.cleanup(); }
});

test('Cordis withdrawal drains maintenance work under ownership and real reinstallation restores unchanged consumers', async t => {
  const f = await fixture();
  let finish = () => {};
  try {
    const ctx = await f.open(), old = ctx.recorderMaintenance;
    let live = 0;
    await ctx.plugin({ inject: ['recorderMaintenance'], apply(scope: Context) { scope.effect(() => { live++; return () => { live--; }; }); } });
    assert.equal(live, 1);
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; }), waiting = new Promise<void>(resolve => { finish = resolve; });
    const create = ctx.recorderRecoveryPoints.create.bind(ctx.recorderRecoveryPoints);
    t.mock.method(ctx.recorderRecoveryPoints, 'create', async (digest: string) => { started(); await waiting; return create(digest); });
    const work = old.upgrade(ctx.recorderMigrationPlanner.inspect().digest);
    const rejected = assert.rejects(work, { code: 'SERVICE_WITHDRAWN' });
    await entered;
    const entry = [...ctx.loader.entries()].find(item => item.options.id === 'maintenance')!;
    const disposing = entry.fiber!.dispose();
    await delay(0);
    assert.equal(live, 0); assert.equal(ctx.recorderDatabase.raw.open, true);
    const peer = await cli(f, 'inspect'); assert.equal(peer.code, 3); assert.match(peer.error, /DATABASE_BUSY/);
    finish(); await rejected; await disposing; t.mock.restoreAll();
    assert.throws(() => old.inspect(), { code: 'SERVICE_WITHDRAWN' });
    await ctx.plugin(maintenance); assert.equal(live, 1);
    const next = await ctx.recorderMaintenance.inspect(); assert.equal(next.state, 'snapshot-needed');
    assert.equal((await ctx.recorderMaintenance.resume(next.plan.digest)).state, 'idle');
  } finally { finish(); t.mock.restoreAll(); await f.cleanup(); }
});
