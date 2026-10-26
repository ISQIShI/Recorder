import assert from 'node:assert/strict';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import { mkdtemp, copyFile, readFile, writeFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MigrationError, type Migration, type MigrationPlanner, type MigrationSource } from '../dist/domain.js';
import { createApplication } from '../dist/application.js';
import { installedMigrations } from '../dist/data/migration-manifest.js';
import * as database from '../dist/plugins/database.js';
import * as ownership from '../dist/plugins/database-ownership.js';
import * as migrations from '../dist/plugins/migrations.js';
import * as executor from '../dist/plugins/migration-executor.js';
import { inspectMigrations, ledgerSql } from '../dist/plugins/migrations/plan.js';
import { executeMigrations } from '../dist/plugins/migrations/execute.js';

const v1: Migration = { namespace: 'alpha', revision: 1, requires: [], packageVersion: '2.4.0', sql: 'CREATE TABLE alpha(id INTEGER PRIMARY KEY, title TEXT);' };
const v2: Migration = { namespace: 'alpha', revision: 2, packageVersion: '2.4.0', sql: 'ALTER TABLE alpha ADD COLUMN note TEXT;' };
const v3: Migration = { namespace: 'alpha', revision: 3, packageVersion: '2.4.0', sql: 'CREATE INDEX alpha_note ON alpha(note);' };
const production: Migration[] = installedMigrations.map(({ file, ...step }) => ({ ...step, sql: readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8') }));
const keys = (rows: { namespace: string; revision: number }[]) => rows.map(row => `${row.namespace}:${row.revision}`);
const inspect = (raw: Database.Database, steps: Migration[], history: Migration[] = []): MigrationPlanner => ({ inspect: () => inspectMigrations(raw, steps, history) });
function execute(raw: Database.Database, steps: Migration[], history: Migration[] = []) {
  const planner = inspect(raw, steps, history);
  return executeMigrations(raw, planner, planner.inspect().digest);
}
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'recorder-versioned-'));
  return { path, async cleanup() { for (const file of await readdir(path)) await unlink(join(path, file)); await rmdir(path); } };
}
async function fixture(steps: Migration[]) {
  const dir = await directory(), ctx = new Context();
  const sources: MigrationSource[] = [];
  for (let at = 0; at < steps.length; at++) {
    const { sql, ...step } = steps[at]!, path = join(dir.path, at + '.sql');
    await writeFile(path, sql); sources.push({ ...step, file: pathToFileURL(path).href });
  }
  await ctx.plugin(ownership, { filename: join(dir.path, 'fixture.sqlite') });
  const dbPlugin = await ctx.plugin(database, { filename: join(dir.path, 'fixture.sqlite') });
  const planPlugin = await ctx.plugin(migrations, { sources, mode: 'inspect' });
  const executePlugin = await ctx.plugin(executor);
  return { ctx, dir, sources, dbPlugin, planPlugin, executePlugin, async cleanup() { await ctx.fiber.dispose(); await dir.cleanup(); } };
}

test('read-only planning distinguishes empty, compatible, upgrade and untracked databases without creating the ledger', () => {
  const raw = new Database(':memory:');
  try {
    const first = inspectMigrations(raw, [v1]);
    assert.equal(first.status, 'empty'); assert.equal(first.digest, inspectMigrations(raw, [v1]).digest);
    assert.deepEqual(raw.prepare('SELECT name FROM sqlite_schema').all(), []);
    execute(raw, [v1]);
    assert.equal(inspectMigrations(raw, [v1]).status, 'compatible');
    const upgrading = inspectMigrations(raw, [v1, v2]);
    assert.equal(upgrading.status, 'upgrade-required'); assert.deepEqual(keys(upgrading.steps), ['alpha:2']);
    assert.deepEqual(upgrading.namespaces, [{ namespace: 'alpha', currentRevision: 1, targetRevision: 2, packageVersion: '2.4.0' }]);
    assert.equal(raw.prepare<[], { n: number }>('SELECT count(*) AS n FROM recorder_migrations').get()!.n, 1);
    assert.equal((raw.pragma('table_info(alpha)') as any[]).length, 2);
  } finally { raw.close(); }
  for (const sql of ['CREATE TABLE other(id INTEGER)', 'CREATE TABLE sqliteX(id INTEGER)', 'CREATE VIEW other AS SELECT 1']) {
    const existing = new Database(':memory:');
    try {
      existing.exec(sql);
      const before = existing.prepare('SELECT * FROM sqlite_schema').all();
      assert.equal(inspectMigrations(existing, [v1]).reasons[0]?.code, 'UNTRACKED_DATABASE');
      assert.deepEqual(existing.prepare('SELECT * FROM sqlite_schema').all(), before);
    } finally { existing.close(); }
  }
});

test('real Cordis services upgrade a fixture v1 to v2 to v3 with versioned namespace dependencies and retained row values', async () => {
  const beta1: Migration = { namespace: 'beta', revision: 1, dependencies: [{ namespace: 'alpha', revision: 2 }], sql: 'CREATE TABLE beta(id INTEGER PRIMARY KEY, parent INTEGER REFERENCES alpha(id));' };
  const alpha3 = { ...v3, dependencies: [{ namespace: 'beta', revision: 1 }] };
  const beta2: Migration = { namespace: 'beta', revision: 2, dependencies: [{ namespace: 'alpha', revision: 3 }], sql: 'ALTER TABLE beta ADD COLUMN extra BLOB DEFAULT NULL;' };
  const f = await fixture([beta2, alpha3, v2, beta1, v1]);
  try {
    const raw = f.ctx.recorderDatabase.raw;
    execute(raw, [v1]); raw.prepare('INSERT INTO alpha VALUES (?, ?)').run(17, 'keep source');
    assert.equal(f.ctx.get('recorderMigrations'), undefined, 'inspect profile must never activate business readiness');
    const plan = f.ctx.recorderMigrationPlanner.inspect();
    assert.deepEqual(keys(plan.steps), ['alpha:2', 'beta:1', 'alpha:3', 'beta:2']);
    assert.equal(plan.digest, inspectMigrations(raw, [v1, beta1, v2, alpha3, beta2]).digest, 'input order is not execution order');
    const result = f.ctx.recorderMigrationExecutor.execute(plan.digest);
    assert.deepEqual(keys(result.committed), keys(plan.steps)); assert.equal(result.plan.status, 'compatible');
    assert.deepEqual(raw.prepare('SELECT * FROM alpha').get(), { id: 17, title: 'keep source', note: null });
    const ledger = raw.prepare('SELECT * FROM recorder_migrations ORDER BY namespace, revision').all();
    assert.deepEqual(f.ctx.recorderMigrationExecutor.execute(result.plan.digest).committed, []);
    assert.deepEqual(raw.prepare('SELECT * FROM recorder_migrations ORDER BY namespace, revision').all(), ledger);
  } finally { await f.cleanup(); }
});

test('manifest duplicate/gap/cycle/missing or invalid version dependencies block before any persistent SQL', () => {
  const cases: [Migration[], string][] = [
    [[v1, v1], 'DUPLICATE_MIGRATION'], [[v1, v3], 'HISTORY_GAP'],
    [[{ ...v1, requires: ['missing'] }], 'MISSING_DEPENDENCY'],
    [[{ ...v1, dependencies: [{ namespace: 'alpha', revision: 2 }] }, v2], 'CYCLIC_DEPENDENCY'],
    [[{ ...v1, dependencies: [{ namespace: 'beta', revision: 2 }] }, { namespace: 'beta', revision: 1, sql: 'CREATE TABLE beta(id INTEGER)' }], 'MISSING_DEPENDENCY'],
    [[{ ...v1, dependencies: [{ namespace: 'beta', revision: 0 }] }], 'INVALID_MANIFEST'],
    [[{ ...v1, requires: ['beta'] }, { namespace: 'beta', revision: 1, requires: ['alpha'], sql: 'CREATE TABLE beta(id INTEGER)' }], 'CYCLIC_DEPENDENCY'],
  ];
  for (const [steps, code] of cases) {
    const raw = new Database(':memory:');
    try {
      const plan = inspectMigrations(raw, steps); assert.equal(plan.status, 'blocked'); assert.equal(plan.reasons[0]?.code, code);
      assert.throws(() => execute(raw, steps), { code }); assert.deepEqual(raw.prepare('SELECT name FROM sqlite_schema').all(), []);
    } finally { raw.close(); }
  }
});

test('ledger digests and complete prefixes reject changed SQL, downgrade, unknown schema and broken committed dependencies', () => {
  const raw = new Database(':memory:');
  try {
    execute(raw, [v1, v2]);
    assert.equal(inspectMigrations(raw, [{ ...v1, sql: v1.sql + ' ' }, v2]).reasons[0]?.code, 'DIGEST_MISMATCH');
    assert.equal(inspectMigrations(raw, [v1]).reasons[0]?.code, 'VERSION_UNSUPPORTED');
    assert.equal(inspectMigrations(raw, [v2]).reasons[0]?.code, 'HISTORY_GAP');
    assert.equal(inspectMigrations(raw, [{ ...v1, dependencies: [{ namespace: 'beta', revision: 1 }] }, v2,
      { namespace: 'beta', revision: 1, sql: 'CREATE TABLE beta(id INTEGER)' }]).reasons[0]?.code, 'INVALID_LEDGER');
    raw.prepare('DELETE FROM recorder_migrations WHERE revision = 1').run();
    assert.equal(inspectMigrations(raw, [v1, v2]).reasons[0]?.code, 'INVALID_LEDGER');
  } finally { raw.close(); }
  const malformed = new Database(':memory:');
  try {
    malformed.exec('CREATE TABLE recorder_migrations(namespace TEXT, revision INTEGER, digest TEXT, applied_at INTEGER)');
    assert.equal(inspectMigrations(malformed, [v1]).reasons[0]?.code, 'INVALID_LEDGER');
  } finally { malformed.close(); }
});

test('removed providers retain ledger and tables, but dependent steps require verifiable committed historical materials', () => {
  const raw = new Database(':memory:');
  const beta: Migration = { namespace: 'beta', revision: 1, requires: ['alpha'], sql: 'CREATE TABLE beta(id INTEGER)' };
  try {
    execute(raw, [v1, v2]); raw.prepare('INSERT INTO alpha VALUES (1, ?, NULL)').run('retained');
    const retained = raw.prepare('SELECT * FROM recorder_migrations').all();
    assert.equal(inspectMigrations(raw, []).status, 'compatible');
    assert.deepEqual(execute(raw, []).committed, []);
    assert.deepEqual(raw.prepare('SELECT * FROM recorder_migrations').all(), retained);
    assert.equal(inspectMigrations(raw, [beta]).reasons[0]?.code, 'UNVERIFIED_HISTORY');
    assert.equal(inspectMigrations(raw, [{ ...beta, dependencies: [{ namespace: 'alpha', revision: 3 }] }], [v1, v2]).reasons[0]?.code, 'MISSING_DEPENDENCY');
    assert.equal(inspectMigrations(raw, [beta], [{ ...v1, sql: v1.sql + ' ' }, v2]).reasons[0]?.code, 'DIGEST_MISMATCH');
    execute(raw, [beta], [v1, v2]);
    assert.deepEqual(raw.prepare('SELECT * FROM alpha').get(), { id: 1, title: 'retained', note: null });
    assert.equal(inspectMigrations(raw, [beta], [{ ...v1, requires: ['unverified'] }, v2]).reasons[0]?.code, 'MISSING_DEPENDENCY');
    assert.equal(inspectMigrations(raw, [beta], [{ ...v1, requires: ['beta'] }, v2]).reasons[0]?.code, 'CYCLIC_DEPENDENCY');
  } finally { raw.close(); }
});

test('controlled SQL rejects DML, extra statements, ledger targets, table rebuilds and unsafe ADD COLUMN forms before writing', () => {
  const rejected = [
    'CREATE TABLE x(id INTEGER); DELETE FROM alpha;', 'CREATE TABLE x(id INTEGER); CREATE TABLE y(id INTEGER)',
    'BEGIN', 'PRAGMA foreign_keys=OFF', "ATTACH DATABASE ':memory:' AS peer", 'CREATE TRIGGER x AFTER INSERT ON alpha BEGIN DELETE FROM alpha; END;',
    'CREATE TABLE x AS SELECT * FROM alpha', 'CREATE VIRTUAL TABLE x USING fts5(body)', 'CREATE TEMP TABLE x(id INTEGER)',
    'DROP TABLE alpha', 'ALTER TABLE alpha RENAME TO other', 'ALTER TABLE alpha DROP COLUMN title',
    'ALTER TABLE alpha ADD COLUMN x TEXT NOT NULL DEFAULT \'forced\'', 'ALTER TABLE alpha ADD COLUMN x INTEGER REFERENCES other(id)',
    'ALTER TABLE alpha ADD COLUMN x TEXT GENERATED ALWAYS AS (title)',
    'CREATE TABLE "RECORDER_MIGRATIONS"(id INTEGER)', 'CREATE INDEX x ON [recorder_migrations](namespace)',
    'ALTER TABLE `recorder_migrations` ADD COLUMN x TEXT', 'CREATE TABLE main.recorder_migrations(id INTEGER)',
    "CREATE TABLE x(id INTEGER DEFAULT(load_extension('unknown')))",
    "CREATE TABLE x(id INTEGER); /* --> statement-breakpoint */ INSERT INTO x VALUES (1)",
  ];
  for (const sql of rejected) {
    const raw = new Database(':memory:');
    try {
      const steps = [{ ...v1, sql }], plan = inspectMigrations(raw, steps);
      assert.equal(plan.reasons[0]?.code, 'SQL_NOT_ALLOWED', sql);
      assert.throws(() => execute(raw, steps), { code: 'SQL_NOT_ALLOWED' });
      assert.deepEqual(raw.prepare('SELECT name FROM sqlite_schema').all(), []);
    } finally { raw.close(); }
  }
  const raw = new Database(':memory:');
  try {
    const quoted = { ...v1, sql: "/* harmless */ CREATE TABLE `quoted`(id INTEGER, body TEXT DEFAULT '--> statement-breakpoint; DELETE FROM x');--> statement-breakpoint\nCREATE INDEX idx ON `quoted`(id);" };
    execute(raw, [quoted]);
    assert.ok(raw.prepare("SELECT name FROM sqlite_schema WHERE name='idx'").get());
  } finally { raw.close(); }
});

test('each step rolls back its own SQL and ledger, preserving committed prefixes and allowing a newly confirmed retry', () => {
  const raw = new Database(':memory:');
  const failing = { ...v3, sql: 'ALTER TABLE alpha ADD COLUMN transient TEXT;--> statement-breakpoint\nCREATE INDEX invalid ON alpha(missing_column);' };
  try {
    let failed: MigrationError | undefined;
    try { execute(raw, [v1, v2, failing]); } catch (error) { failed = error as MigrationError; }
    assert.equal(failed?.code, 'STEP_FAILED'); assert.deepEqual(keys(failed!.committed), ['alpha:1', 'alpha:2']);
    assert.deepEqual(keys(failed!.plan!.steps), ['alpha:3']);
    assert.deepEqual((raw.pragma('table_info(alpha)') as any[]).map(row => row.name), ['id', 'title', 'note']);
    assert.deepEqual(keys(inspectMigrations(raw, [v1, v2, failing]).applied), ['alpha:1', 'alpha:2']);
    const oldDigest = failed!.plan!.digest, planner = inspect(raw, [v1, v2, v3]);
    assert.throws(() => executeMigrations(raw, planner, oldDigest), { code: 'STALE_PLAN' });
    assert.deepEqual(keys(executeMigrations(raw, planner, planner.inspect().digest).committed), ['alpha:3']);
    raw.transaction(() => assert.throws(() => execute(raw, [v1, v2, v3]), { code: 'TRANSACTION_ACTIVE' }))();
  } finally { raw.close(); }
  const foreign = new Database(':memory:');
  try {
    const bad: Migration = { namespace: 'beta', revision: 1, sql: 'CREATE TABLE parent(id INTEGER);--> statement-breakpoint\nCREATE TABLE child(parent_id INTEGER REFERENCES parent(id));' };
    assert.throws(() => execute(foreign, [v1, bad]), (error: unknown) => error instanceof MigrationError && error.code === 'FOREIGN_KEY_FAILED' && keys(error.committed).join() === 'alpha:1');
    assert.equal(foreign.prepare("SELECT name FROM sqlite_schema WHERE name IN ('parent','child')").all().length, 0);
    assert.deepEqual(keys(inspectMigrations(foreign, [v1]).applied), ['alpha:1']);
  } finally { foreign.close(); }
});

test('execution rechecks source SQL/dependencies, schema, ledger and database location instead of trusting a supplied plan object', async () => {
  const f = await fixture([v1, v2]);
  try {
    const planner = f.ctx.recorderMigrationPlanner, runner = f.ctx.recorderMigrationExecutor;
    const first = planner.inspect();
    first.steps[0]!.sql = 'CREATE TABLE attacker(id INTEGER)';
    runner.execute(first.digest);
    assert.equal(f.ctx.recorderDatabase.raw.prepare("SELECT name FROM sqlite_schema WHERE name='attacker'").get(), undefined);
    const compatible = planner.inspect();
    await writeFile(join(f.dir.path, '1.sql'), v2.sql + '\n');
    assert.throws(() => runner.execute(compatible.digest), { code: 'STALE_PLAN' });
    await writeFile(join(f.dir.path, '1.sql'), v2.sql);
    (f.sources[1] as MigrationSource).dependencies = [{ namespace: 'alpha', revision: 1 }];
    // Semantically equivalent explicit/implicit dependencies are normalized to the same minimum.
    assert.equal(planner.inspect().digest, compatible.digest);
    f.sources[1]!.packageVersion = '2.5.0';
    assert.throws(() => runner.execute(compatible.digest), { code: 'STALE_PLAN' });
    f.sources[1]!.packageVersion = '2.4.0';
    f.ctx.recorderDatabase.raw.exec('CREATE TABLE external_change(id INTEGER)');
    assert.throws(() => runner.execute(compatible.digest), { code: 'STALE_PLAN' });
    const external = planner.inspect();
    f.ctx.recorderDatabase.raw.prepare('UPDATE recorder_migrations SET applied_at = applied_at + 1').run();
    assert.throws(() => runner.execute(external.digest), { code: 'STALE_PLAN' });
    const final = planner.inspect();
    await f.ctx.fiber.dispose();
    // Copy only after all handles close: identical contents must still require a new location-bound confirmation.
    await copyFile(join(f.dir.path, 'fixture.sqlite'), join(f.dir.path, 'different.sqlite'));
    const peer = new Database(join(f.dir.path, 'different.sqlite')), reopened = new Database(join(f.dir.path, 'fixture.sqlite'));
    try {
      assert.deepEqual(inspectMigrations(peer, [v1, v2]).applied, final.applied);
      assert.equal(inspectMigrations(reopened, [v1, v2]).digest, final.digest);
      assert.notEqual(inspectMigrations(peer, [v1, v2]).digest, final.digest);
    } finally { peer.close(); reopened.close(); }
  } finally { await f.cleanup(); }
  const raw = new Database(':memory:');
  try {
    execute(raw, [v1]);
    const beta: Migration = { namespace: 'beta', revision: 1, sql: 'CREATE TABLE beta(id INTEGER)' };
    const steps = [v1, v2, beta], planner = inspect(raw, steps), before = planner.inspect();
    beta.dependencies = [{ namespace: 'alpha', revision: 2 }];
    assert.throws(() => executeMigrations(raw, planner, before.digest), { code: 'STALE_PLAN' });
    assert.equal((raw.pragma('table_info(alpha)') as any[]).length, 2);
  } finally { raw.close(); }
});

test('a material replacement between commits stops before the next step and requires a fresh confirmation', () => {
  const raw = new Database(':memory:');
  const second = { ...v2 }, steps = [v1, second, v3];
  let replaced = false;
  const planner: MigrationPlanner = { inspect() {
    const current = inspectMigrations(raw, steps);
    if (!raw.inTransaction && current.applied.length === 1 && !replaced) {
      replaced = true; second.sql = 'ALTER TABLE alpha ADD COLUMN replacement TEXT;';
      return inspectMigrations(raw, steps);
    }
    return current;
  } };
  try {
    assert.throws(() => executeMigrations(raw, planner, planner.inspect().digest), (error: unknown) =>
      error instanceof MigrationError && error.code === 'STALE_PLAN' && keys(error.committed).join() === 'alpha:1');
    assert.equal(replaced, true);
    assert.deepEqual((raw.pragma('table_info(alpha)') as any[]).map(row => row.name), ['id', 'title']);
    assert.deepEqual(keys(inspectMigrations(raw, steps).applied), ['alpha:1']);
  } finally { raw.close(); }
});

test('Cordis withdraws planner/executor with the database and restores once without touching retained data', async () => {
  const f = await fixture([v1]);
  try {
    const planner = f.ctx.recorderMigrationPlanner, runner = f.ctx.recorderMigrationExecutor;
    runner.execute(planner.inspect().digest);
    await f.dbPlugin.dispose(); await f.planPlugin.await(); await f.executePlugin.await();
    assert.equal(f.ctx.get('recorderMigrationPlanner'), undefined); assert.equal(f.ctx.get('recorderMigrationExecutor'), undefined);
    assert.throws(() => planner.inspect(), { code: 'SERVICE_WITHDRAWN' });
    assert.throws(() => runner.execute('old'), { code: 'SERVICE_WITHDRAWN' });
    await f.ctx.plugin(database, { filename: join(f.dir.path, 'fixture.sqlite') });
    await f.planPlugin.await(); await f.executePlugin.await();
    const next = f.ctx.recorderMigrationPlanner.inspect();
    assert.equal(next.status, 'compatible'); assert.deepEqual(f.ctx.recorderMigrationExecutor.execute(next.digest).committed, []);
    await f.planPlugin.dispose(); await f.executePlugin.await();
    assert.equal(f.ctx.get('recorderMigrationExecutor'), undefined);
    await f.ctx.plugin({ inject: ['recorderDatabase'], apply(owner: Context) {
      owner.provide('recorderMigrationPlanner', { inspect: () => inspectMigrations(owner.recorderDatabase.raw, [v1]) });
    } });
    await f.executePlugin.await();
    assert.deepEqual(f.ctx.recorderMigrationExecutor.execute(f.ctx.recorderMigrationPlanner.inspect().digest).committed, []);
  } finally { await f.cleanup(); }
});

test('production v1 SQL/digests and business rows remain unchanged, and the business profile exposes no upgrade executor', async () => {
  const dir = await directory(), filename = join(dir.path, 'legacy.sqlite');
  const raw = new Database(filename);
  // Build the old success ledger verbatim, without using the new planner or executor.
  try {
    raw.exec(ledgerSql);
    for (const step of production) {
      raw.exec(step.sql.split('--> statement-breakpoint').join('\n'));
      raw.prepare('INSERT INTO recorder_migrations VALUES (?, ?, ?, ?)').run(step.namespace, 1, createHash('sha256').update(step.sql).digest('hex'), 123);
    }
    raw.exec("INSERT INTO core_instance VALUES ('sample-instance',1); INSERT INTO identity_users VALUES ('sample-owner','owner','isolated-hash',1,10)");
    raw.prepare('INSERT INTO records_entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('record-1','sample-owner','request-1','request-hash','title','source','plain',1,7,'sample-instance',12,13);
  } finally { raw.close(); }
  let ctx: Awaited<ReturnType<typeof createApplication>> | undefined;
  try {
    ctx = await createApplication({ filename, dataDir: dir.path, setupCode: 'test-only-setup-code', http: { listen: false } });
    assert.equal(ctx.get('recorderMigrationExecutor'), undefined);
    assert.equal(ctx.recorderMigrationPlanner.inspect().status, 'compatible');
    assert.deepEqual(ctx.recorderDatabase.raw.prepare('SELECT applied_at FROM recorder_migrations').all(), [{ applied_at: 123 }, { applied_at: 123 }]);
    assert.equal(ctx.recorderRecordStore.get('sample-owner', 'record-1')?.revision, 7);
    assert.equal(ctx.recorderIdentityStore.user('owner')?.passwordHash, 'isolated-hash');
    const before = ctx.recorderDatabase.raw.prepare('SELECT * FROM recorder_migrations').all();
    await ctx.loader.update('migrations', { disabled: true }); await ctx.loader.await();
    assert.equal(ctx.get('recorderAuth'), undefined); assert.equal(ctx.get('recorderHttp'), undefined);
    await ctx.loader.update('migrations', { disabled: false }); await ctx.loader.await();
    assert.equal(ctx.recorderMigrations.ready, true);
    assert.deepEqual(ctx.recorderDatabase.raw.prepare('SELECT * FROM recorder_migrations').all(), before);
  } finally { await ctx?.fiber.dispose(); await dir.cleanup(); }
});

test('safe startup refuses an existing database needing a new namespace and closes the real database handle before rejecting', async t => {
  const dir = await directory(), filename = join(dir.path, 'recorder.sqlite');
  const raw = new Database(filename);
  try { execute(raw, production.slice(0, 1)); raw.exec("INSERT INTO identity_users VALUES ('owner','owner','isolated-hash',1,5)"); } finally { raw.close(); }
  const closed: Database.Database[] = [], originalClose = Database.prototype.close;
  t.mock.method(Database.prototype, 'close', function(this: Database.Database) { if (this.name === filename) closed.push(this); return originalClose.call(this); });
  try {
    await assert.rejects(createApplication({ filename, dataDir: dir.path, http: { port: 0 } }), (error: unknown) => error instanceof MigrationError && error.code === 'UPGRADE_REQUIRED');
    assert.equal(closed.length, 1); assert.equal(closed[0]!.open, false);
    const reopened = new Database(filename);
    try {
      assert.deepEqual(reopened.prepare('SELECT username,password_hash FROM identity_users').all(), [{ username: 'owner', password_hash: 'isolated-hash' }]);
      assert.equal(reopened.prepare("SELECT name FROM sqlite_schema WHERE name='records_entries'").get(), undefined);
      assert.equal(inspectMigrations(reopened, production).status, 'upgrade-required');
    } finally { reopened.close(); }
    assert.ok(!(await readdir(dir.path)).includes('setup-code.txt'));
    const child = spawn(process.execPath, ['dist/main.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, RECORDER_DATA_DIR: dir.path, RECORDER_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    const exit = await new Promise<number | null>((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); if (timedOut) reject(new Error('Blocked startup did not release resources')); else resolve(code); });
    });
    assert.equal(exit, 1); assert.equal(JSON.parse(output.trim()).code, 'UPGRADE_REQUIRED');
  } finally { t.mock.restoreAll(); await dir.cleanup(); }
});

test('corrupt files, foreign-key violations, and a nonempty database without a ledger remain blocked without repair', async () => {
  const dir = await directory(), filename = join(dir.path, 'invalid.sqlite');
  try {
    await writeFile(filename, 'isolated not-a-database sample');
    const raw = new Database(filename);
    try { assert.equal(inspectMigrations(raw, production).reasons[0]?.code, 'DATABASE_CORRUPT'); } finally { raw.close(); }
    await assert.rejects(createApplication({ filename, dataDir: dir.path, http: { listen: false } }), { code: 'DATABASE_CORRUPT' });
    assert.equal(await readFile(filename, 'utf8'), 'isolated not-a-database sample');
  } finally { await dir.cleanup(); }
  const raw = new Database(':memory:');
  try {
    execute(raw, [v1]); raw.pragma('foreign_keys=OFF');
    raw.exec('CREATE TABLE invalid_child(parent INTEGER REFERENCES alpha(id)); INSERT INTO invalid_child VALUES(999)');
    assert.equal(inspectMigrations(raw, [v1]).reasons[0]?.code, 'FOREIGN_KEY_FAILED');
    assert.equal(raw.prepare<[], { parent: number }>('SELECT parent FROM invalid_child').get()!.parent, 999);
  } finally { raw.close(); }
});

test('business startup rejects untracked, checksum-changed and newer data without activating repositories or writing migrations', async () => {
  const dir = await directory();
  try {
    for (const code of ['UNTRACKED_DATABASE', 'DIGEST_MISMATCH', 'VERSION_UNSUPPORTED']) {
      const filename = join(dir.path, code + '.sqlite'), raw = new Database(filename);
      let before: unknown[];
      try {
        if (code === 'UNTRACKED_DATABASE') raw.exec("CREATE TABLE only_user_data(id INTEGER, body TEXT); INSERT INTO only_user_data VALUES(1,'preserve')");
        else {
          execute(raw, production);
          if (code === 'DIGEST_MISMATCH') raw.prepare('UPDATE recorder_migrations SET digest = ? WHERE namespace = ?').run('a'.repeat(64), 'identity');
          else raw.prepare('INSERT INTO recorder_migrations VALUES (?, ?, ?, ?)').run('identity', 2, 'b'.repeat(64), 234);
        }
        before = raw.prepare('SELECT * FROM sqlite_schema ORDER BY name').all();
      } finally { raw.close(); }
      await assert.rejects(createApplication({ filename, dataDir: dir.path, http: { listen: false } }), { code });
      const after = new Database(filename);
      try {
        assert.deepEqual(after.prepare('SELECT * FROM sqlite_schema ORDER BY name').all(), before!);
        if (code === 'UNTRACKED_DATABASE') assert.deepEqual(after.prepare('SELECT * FROM only_user_data').all(), [{ id: 1, body: 'preserve' }]);
        else assert.equal(after.prepare<[], { n: number }>('SELECT count(*) AS n FROM identity_users').get()!.n, 0);
      } finally { after.close(); }
    }
    assert.ok(!(await readdir(dir.path)).includes('setup-code.txt'));
  } finally { await dir.cleanup(); }
});

test('read-only planning reports a busy database and never takes over its transaction', async () => {
  const dir = await directory(), filename = join(dir.path, 'busy.sqlite'), writer = new Database(filename), peer = new Database(filename);
  try {
    execute(writer, [v1]); peer.pragma('busy_timeout=1'); writer.exec('BEGIN EXCLUSIVE');
    const plan = inspectMigrations(peer, [v1, v2]);
    assert.equal(plan.reasons[0]?.code, 'DATABASE_BUSY'); assert.equal(writer.inTransaction, true);
    writer.exec('ROLLBACK'); assert.equal(inspectMigrations(peer, [v1]).status, 'compatible');
  } finally { if (writer.inTransaction) writer.exec('ROLLBACK'); writer.close(); peer.close(); await dir.cleanup(); }
});
