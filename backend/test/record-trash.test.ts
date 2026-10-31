import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createApplication } from '../dist/application.js';
import { installedMigrations } from '../dist/data/migration-manifest.js';
import { ledgerSql } from '../dist/plugins/migrations/plan.js';
import * as database from '../dist/plugins/database.js';
import * as migrations from '../dist/plugins/migrations.js';
import * as identityStore from '../dist/plugins/identity-store.js';
import * as recordStore from '../dist/plugins/record-store.js';
import * as crypto from '../dist/plugins/crypto.js';
import type { RecordData } from '@recorder/contracts';

const native = { 'x-recorder-client': 'native', 'x-recorder-request': '1' };
const setupCode = 'isolated-trash-setup-code-only';
const credentials = { username: 'owner', password: 'correct horse battery staple', remember: true, clientName: 'Trash test' };
type App = Awaited<ReturnType<typeof createApplication>>;
async function sample() {
  const directory = await mkdtemp(join(tmpdir(), 'recorder-trash-')), filename = join(directory, 'data.sqlite');
  return { directory, filename, async cleanup() {
    const path = resolve(directory); assert.equal(dirname(path), resolve(tmpdir())); assert.ok(basename(path).startsWith('recorder-trash-'));
    await rm(path, { recursive: true, force: true });
  } };
}
async function owner(ctx: App) {
  const response = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/setup', headers: native, payload: { ...credentials, setupCode } });
  assert.equal(response.statusCode, 200, response.body);
  return { ...native, authorization: 'Bearer ' + response.headers['x-recorder-session'] };
}
const input = () => ({ requestId: randomUUID(), title: '回收站关键词', body: '# 保留正文\n<script>source</script>', format: 'markdown' as const });
function post(ctx: App, path: string, payload: object, headers: Record<string, string> = native) { return ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/records' + path, payload, headers }); }
function get(ctx: App, path: string, headers: Record<string, string>) { return ctx.recorderHttp.server.inject({ url: '/api/v1/records' + path, headers }); }
async function cli(filename: string, command: string, args: string[] = []) {
  const child = spawn(process.execPath, ['backend/dist/maintenance-cli.js', command, '--database', filename, ...args], { cwd: new URL('../../', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { error += value; });
  return new Promise<{ code: number | null; output: string; error: string }>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Maintenance CLI timed out: ' + error)); }, 60000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); resolve({ code, output, error }); });
  });
}

test('trash/restore are revision-checked transactions, preserve identity and creation replay, and persist across restart', async () => {
  const f = await sample(); let ctx = await createApplication({ filename: f.filename, setupCode, http: { listen: false } });
  const peer = new Context();
  try {
    const headers = await owner(ctx), createInput = input();
    const before = (await post(ctx, '', createInput, headers)).json<RecordData>(); assert.equal(before.deletedAt, null);
    const stored = ctx.recorderDatabase.raw.prepare('SELECT * FROM records_entries WHERE id=?').get(before.id) as Record<string, unknown>;
    const move = await post(ctx, '/' + before.id + '/trash', { expectedRevision: 1 }, headers); assert.equal(move.statusCode, 200, move.body);
    const trashed = move.json<RecordData>();
    assert.deepEqual(trashed, { ...before, revision: 2, updatedAt: trashed.updatedAt, deletedAt: trashed.deletedAt }); assert.equal(trashed.deletedAt, trashed.updatedAt);
    assert.equal((await get(ctx, '?q=关键词', headers)).json().total, 0);
    const page = (await get(ctx, '?state=trash&q=关键词&limit=1&offset=0', headers)).json(); assert.deepEqual(page.items, [trashed]); assert.equal(page.total, 1);
    assert.equal((await get(ctx, '?state=trash&limit=1&offset=1', headers)).json().items.length, 0);
    assert.deepEqual((await get(ctx, '/' + before.id, headers)).json(), trashed);
    assert.deepEqual((await post(ctx, '', createInput, headers)).json(), trashed, 'Creation replay never restores trash');
    assert.deepEqual((await post(ctx, '/' + before.id + '/trash', { expectedRevision: 2 }, headers)).json(), trashed, 'Current same-state call creates no new revision');
    assert.equal((await post(ctx, '/' + before.id + '/trash', { expectedRevision: 1 }, headers)).statusCode, 409);
    const edit = await ctx.recorderHttp.server.inject({ method: 'PUT', url: '/api/v1/records/' + before.id, headers, payload: { expectedRevision: 2, title: '', body: 'forbidden', format: 'plain' } });
    assert.equal(edit.statusCode, 409); assert.equal(edit.json().code, 'RECORD_TRASHED');
    await ctx.fiber.dispose(); ctx = await createApplication({ filename: f.filename, http: { listen: false } });
    assert.deepEqual((await get(ctx, '?state=trash', headers)).json().items, [trashed]);

    // A second managed connection shares this host's lease; both race on the same actual SQLite file.
    await peer.plugin((scope: Context) => { scope.provide('recorderDatabaseOwnership', ctx.recorderDatabaseOwnership); });
    await peer.plugin(database, { filename: f.filename }); await peer.plugin(migrations, { sources: installedMigrations });
    await peer.plugin(crypto); await peer.plugin(identityStore); await peer.plugin(recordStore);
    const ownerId = String(stored.owner_id);
    const results = await Promise.all([
      post(ctx, '/' + before.id + '/restore', { expectedRevision: 2 }, headers).then(r => r.statusCode),
      Promise.resolve().then(() => { try { peer.recorderRecordStore.setState(ownerId, { id: before.id, expectedRevision: 2 }, 'active', Date.now()); return 200; } catch (error) { return (error as { statusCode: number }).statusCode; } }),
    ]);
    assert.deepEqual(results.sort(), [200, 409]);
    const restored = (await get(ctx, '/' + before.id, headers)).json<RecordData>();
    assert.deepEqual(restored, { ...before, revision: 3, updatedAt: restored.updatedAt });
    assert.deepEqual((await post(ctx, '/' + before.id + '/restore', { expectedRevision: 3 }, headers)).json(), restored);
    const after = ctx.recorderDatabase.raw.prepare('SELECT * FROM records_entries WHERE id=?').get(before.id) as Record<string, unknown>;
    for (const key of ['id', 'owner_id', 'request_id', 'request_hash', 'created_at', 'origin_instance_id', 'title', 'body', 'format', 'format_version']) assert.equal(after[key], stored[key], key);
  } finally { await peer.fiber.dispose(); await ctx.fiber.dispose(); await f.cleanup(); }
});

test('trash APIs enforce authentication, strict inputs, CSRF, ownership, transactional emptying and plugin withdrawal', async () => {
  const ctx = await createApplication({ filename: ':memory:', setupCode, http: { listen: false } });
  try {
    const headers = await owner(ctx), createdInput = input(), record = (await post(ctx, '', createdInput, headers)).json<RecordData>();
    const otherId = randomUUID(), token = ctx.recorderCrypto.token();
    ctx.recorderDatabase.raw.prepare('INSERT INTO identity_users VALUES(?,?,?,?,?)').run(otherId, 'other', 'isolated-hash', 2, 1);
    ctx.recorderIdentityStore.createSession({ id: randomUUID(), userId: otherId, tokenHash: ctx.recorderCrypto.digest(token), channel: 'native', clientName: 'other', createdAt: 1, expiresAt: Date.now() + 60000 });
    const other = { ...native, authorization: 'Bearer ' + token };
    const otherRecord = (await post(ctx, '', input(), other)).json<RecordData>();
    await post(ctx, '/' + otherRecord.id + '/trash', { expectedRevision: 1 }, other);
    for (const command of ['trash', 'restore']) {
      const path = '/' + record.id + '/' + command;
      assert.equal((await post(ctx, path, { expectedRevision: 1 })).statusCode, 401);
      assert.equal((await post(ctx, path, { expectedRevision: 1 }, other)).statusCode, 404);
      assert.equal((await post(ctx, '/' + randomUUID() + '/' + command, { expectedRevision: 1 }, headers)).statusCode, 404);
      for (const invalid of [{}, { expectedRevision: '1' }, { expectedRevision: true }, { expectedRevision: 0 }, { expectedRevision: 1.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { expectedRevision: 1, deletedAt: 0 }, { expectedRevision: 1, id: otherRecord.id }]) assert.equal((await post(ctx, path, invalid, headers)).statusCode, 400, JSON.stringify(invalid));
    }
    assert.equal((await get(ctx, '/' + otherRecord.id, headers)).statusCode, 404);
    assert.equal((await get(ctx, '?state=all', headers)).statusCode, 400);
    assert.equal((await post(ctx, '/trash/empty', { confirm: true })).statusCode, 401);
    for (const invalid of [{}, { confirm: false }, { confirm: 'true' }, { confirm: 1 }, { confirm: true, ownerId: otherId }]) assert.equal((await post(ctx, '/trash/empty', invalid, headers)).statusCode, 400);

    const login = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'x-recorder-request': '1', origin: 'http://localhost:5173' }, payload: credentials });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!, csrf = String(login.headers['x-csrf-token']);
    const web = { cookie, origin: 'http://localhost:5173', 'x-recorder-request': '1' };
    for (const [path, payload] of [['/' + record.id + '/trash', { expectedRevision: 1 }], ['/' + record.id + '/restore', { expectedRevision: 1 }], ['/trash/empty', { confirm: true }]] as const) {
      assert.equal((await post(ctx, path, payload, web)).statusCode, 403);
      assert.equal((await post(ctx, path, payload, { ...web, origin: 'https://attacker.example', 'x-csrf-token': csrf })).statusCode, 403);
    }
    const trashed = await post(ctx, '/' + record.id + '/trash', { expectedRevision: 1 }, { ...web, 'x-csrf-token': csrf }); assert.equal(trashed.statusCode, 200);
    const active = (await post(ctx, '', input(), headers)).json<RecordData>();
    // A DELETE failure rolls back the whole empty operation; neither owner's trash is lost.
    ctx.recorderDatabase.raw.exec("CREATE TRIGGER reject_empty BEFORE DELETE ON records_entries BEGIN SELECT RAISE(ABORT,'controlled delete failure'); END");
    assert.equal((await post(ctx, '/trash/empty', { confirm: true }, headers)).statusCode, 500);
    assert.equal((await get(ctx, '?state=trash', headers)).json().total, 1);
    ctx.recorderDatabase.raw.exec('DROP TRIGGER reject_empty');
    const empty = await post(ctx, '/trash/empty', { confirm: true }, headers); assert.equal(empty.statusCode, 200); assert.deepEqual(empty.json(), { deleted: 1 });
    assert.equal((await get(ctx, '/' + active.id, headers)).statusCode, 200);
    assert.equal((await get(ctx, '/' + record.id, headers)).statusCode, 404);
    assert.equal((await post(ctx, '/' + record.id + '/restore', { expectedRevision: 2 }, headers)).statusCode, 404);
    assert.equal((await get(ctx, '?state=trash', other)).json().total, 1);
    assert.deepEqual((await post(ctx, '/trash/empty', { confirm: true }, headers)).json(), { deleted: 0 });
    const replay = (await post(ctx, '', createdInput, headers)).json<RecordData>(); assert.notEqual(replay.id, record.id); assert.equal(replay.deletedAt, null);
    const api = (await ctx.recorderHttp.server.inject({ url: '/openapi.json' })).json();
    assert.equal(api.paths['/api/v1/records/{id}/trash'].post.operationId, 'trashRecord');
    assert.ok(api.paths['/api/v1/records/{id}/restore'].post.responses['409']);
    assert.equal(api.paths['/api/v1/records/trash/empty'].post.requestBody.content['application/json'].schema.properties.confirm.const, true);
    assert.ok(api.paths['/api/v1/records'].get.parameters.some((p: any) => p.name === 'state'));
    await ctx.loader.update('records', { disabled: true }); await ctx.loader.await();
    assert.equal((await post(ctx, '/trash/empty', { confirm: true }, headers)).statusCode, 503);
    await ctx.loader.update('records', { disabled: false }); await ctx.loader.await();
    assert.equal((await get(ctx, '?state=trash', other)).json().total, 1);
  } finally { await ctx.fiber.dispose(); }
});

test('a real production v1 sample requires CLI confirmation and a recovery point before records revision 2, retaining all old values', async () => {
  const f = await sample(), raw = new Database(f.filename), recordId = randomUUID(), userId = randomUUID();
  let before: Record<string, unknown>, identity: unknown[], ledger: unknown[];
  try {
    raw.exec(ledgerSql);
    const digests = ['b4407f95f083733826bd9b100622547696fb812b2c41102da0e47038952a63e3', '9232a42a20abfcca4a7e9f76b196efad4e355507bba7e002077e760a9cec2145'];
    for (const [i, step] of installedMigrations.filter(step => step.revision === 1 && ['identity', 'records'].includes(step.namespace)).entries()) {
      const sql = await readFile(new URL('../migrations/' + step.file, import.meta.url), 'utf8'), digest = createHash('sha256').update(sql).digest('hex');
      assert.equal(digest, digests[i], 'Applied revision 1 SQL bytes remain unchanged'); raw.exec(sql.split('--> statement-breakpoint').join('\n'));
      raw.prepare('INSERT INTO recorder_migrations VALUES(?,?,?,?)').run(step.namespace, 1, digest, 123);
    }
    raw.prepare('INSERT INTO core_instance VALUES(?,1)').run(randomUUID());
    raw.prepare('INSERT INTO identity_users VALUES(?,?,?,?,?)').run(userId, 'legacy', 'isolated-old-password-hash', 1, 1);
    raw.prepare('INSERT INTO identity_sessions VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), userId, 'isolated-old-session-hash', 'native', 'legacy sample', 1, 9999999999999, null);
    raw.prepare('INSERT INTO records_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(recordId, userId, randomUUID(), 'original-request-hash', '旧记录', '# 旧正文', 'markdown', 1, 7, 'original-origin', 12, 13);
    before = raw.prepare('SELECT * FROM records_entries').get() as Record<string, unknown>; identity = raw.prepare('SELECT * FROM identity_sessions').all(); ledger = raw.prepare('SELECT * FROM recorder_migrations').all();
  } finally { raw.close(); }
  let app: App | undefined;
  try {
    await assert.rejects(createApplication({ filename: f.filename, http: { listen: false } }), { code: 'UPGRADE_REQUIRED' });
    const inspect = await cli(f.filename, 'inspect'); assert.equal(inspect.code, 0, inspect.error);
    const plan = JSON.parse(inspect.output.trim()).plan; assert.equal(plan.status, 'upgrade-required'); assert.deepEqual(plan.steps.map((s: any) => [s.namespace, s.revision]), [['records', 2], ['attachments', 1], ['categories', 1], ['tags', 1]]);
    assert.equal((await cli(f.filename, 'upgrade')).code, 2);
    assert.equal((await cli(f.filename, 'upgrade', ['--confirm', '0'.repeat(64)])).code, 2);
    const upgrade = await cli(f.filename, 'upgrade', ['--confirm', plan.digest]); assert.equal(upgrade.code, 0, upgrade.error);
    const points = await cli(f.filename, 'points'); assert.equal(points.code, 0, points.error);
    const point = JSON.parse(points.output.trim()).valid[0]; assert.equal(point.manifest.plan.digest, plan.digest); assert.equal(point.manifest.ledger.length, 2);
    app = await createApplication({ filename: f.filename, http: { listen: false } });
    assert.deepEqual(app.recorderDatabase.raw.prepare('SELECT * FROM records_entries').get(), { ...before!, deleted_at: null });
    assert.deepEqual(app.recorderDatabase.raw.prepare('SELECT * FROM identity_sessions').all(), identity!);
    assert.deepEqual(app.recorderDatabase.raw.prepare("SELECT * FROM recorder_migrations WHERE revision=1 AND namespace IN ('identity','records')").all(), ledger!);
    assert.equal(app.recorderRecordStore.get(userId, recordId)?.revision, 7); assert.equal(app.recorderRecordStore.get(userId, recordId)?.deletedAt, null);
    assert.equal(app.recorderDatabase.raw.pragma('integrity_check', { simple: true }), 'ok'); assert.deepEqual(app.recorderDatabase.raw.pragma('foreign_key_check'), []);
  } finally { await app?.fiber.dispose(); await f.cleanup(); }
});
