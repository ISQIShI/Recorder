import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createApplication } from '../dist/application.js';
import { installedMigrations } from '../dist/data/migration-manifest.js';
import { ledgerSql } from '../dist/plugins/migrations/plan.js';
import type { RecordData, TagData } from '@recorder/contracts';

type App = Awaited<ReturnType<typeof createApplication>>;
const setupCode = 'isolated-tags-setup-code-only';
const native = { 'x-recorder-client': 'native', 'x-recorder-request': '1' };
async function sample() {
  const directory = await mkdtemp(join(tmpdir(), 'recorder-tags-'));
  return { filename: join(directory, 'data.sqlite'), async cleanup() {
    const path = resolve(directory); assert.equal(dirname(path), resolve(tmpdir())); assert.ok(basename(path).startsWith('recorder-tags-'));
    await rm(path, { recursive: true, force: true });
  } };
}
async function owner(ctx: App) {
  const r = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/setup', headers: native,
    payload: { username: 'owner', password: 'correct horse battery staple', remember: true, clientName: 'Tags test', setupCode } });
  assert.equal(r.statusCode, 200, r.body);
  return { ...native, authorization: 'Bearer ' + r.headers['x-recorder-session'] };
}
function api(ctx: App, headers: Record<string, string>, path: string, payload?: object) {
  return ctx.recorderHttp.server.inject({ method: payload ? 'POST' : 'GET', url: '/api/v1/' + path, headers, ...(payload ? { payload } : {}) });
}
const recordInput = (title = '标签关键字') => ({ requestId: randomUUID(), title, body: '# searchable <script>source</script>', format: 'markdown' as const });
async function cli(filename: string, command: string, args: string[] = []) {
  const child = spawn(process.execPath, ['backend/dist/maintenance-cli.js', command, '--database', filename, ...args], { cwd: new URL('../../', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = ''; child.stdout.on('data', v => { output += v; }); child.stderr.on('data', v => { error += v; });
  return new Promise<{ code: number | null; output: string; error: string }>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('CLI timeout: ' + error)); }, 60000);
    child.on('error', e => { clearTimeout(timeout); reject(e); }); child.on('exit', code => { clearTimeout(timeout); resolve({ code, output, error }); });
  });
}

test('tags reuse exact trimmed names, associate idempotently, filter with record search/paging and preserve records across trash/restart/empty', async () => {
  const f = await sample(); let ctx = await createApplication({ filename: f.filename, setupCode, http: { listen: false } });
  try {
    const h = await owner(ctx);
    const record = (await api(ctx, h, 'records', recordInput())).json<RecordData>();
    const second = (await api(ctx, h, 'records', recordInput('second'))).json<RecordData>();
    const firstTag = (await api(ctx, h, 'tags', { name: '  标签 <script>  ' })).json<TagData>();
    assert.equal(firstTag.name, '标签 <script>');
    assert.deepEqual((await api(ctx, h, 'tags', { name: firstTag.name })).json(), firstTag);
    const tag2 = (await api(ctx, h, 'tags', { name: 'Other' })).json<TagData>();
    const tag3 = (await api(ctx, h, 'tags', { name: 'other' })).json<TagData>(); assert.notEqual(tag2.id, tag3.id);
    for (const tag of [firstTag, firstTag, tag2]) assert.equal((await api(ctx, h, `records/${record.id}/tags/add`, { tagId: tag.id })).statusCode, 200);
    await api(ctx, h, `records/${second.id}/tags/add`, { tagId: firstTag.id });
    assert.equal((await api(ctx, h, `records/${record.id}/tags`)).json().items.length, 2);
    assert.deepEqual((await api(ctx, h, 'records/' + record.id)).json(), record, 'Tag operations change no body metadata or revision');
    const page = (await api(ctx, h, `tags/${firstTag.id}/records?q=SEARCHABLE&limit=1&offset=1`)).json();
    assert.equal(page.total, 2); assert.equal(page.items.length, 1);
    assert.equal((await api(ctx, h, `tags/${firstTag.id}/records?q=标签`)).json().items[0].id, record.id);
    assert.equal((await api(ctx, h, `tags/${firstTag.id}/records?q=%25`)).json().total, 0, 'Keyword is literal, not LIKE wildcards');
    for (let i = 0; i < 2; i++) assert.equal((await api(ctx, h, `records/${record.id}/tags/remove`, { tagId: tag2.id })).statusCode, 200);
    assert.equal((await api(ctx, h, 'tags')).json().items.length, 3);
    assert.deepEqual((await api(ctx, h, 'records/' + record.id)).json(), record);
    await api(ctx, h, `records/${record.id}/trash`, { expectedRevision: 1 });
    for (const action of ['add', 'remove']) {
      const r = await api(ctx, h, `records/${record.id}/tags/${action}`, { tagId: firstTag.id }); assert.equal(r.statusCode, 409); assert.equal(r.json().code, 'RECORD_TRASHED');
    }
    assert.deepEqual((await api(ctx, h, `records/${record.id}/tags`)).json().items, [firstTag]);
    assert.equal((await api(ctx, h, `tags/${firstTag.id}/records`)).json().total, 1);
    await ctx.fiber.dispose(); ctx = await createApplication({ filename: f.filename, http: { listen: false } });
    assert.deepEqual((await api(ctx, h, `records/${record.id}/tags`)).json().items, [firstTag]);
    await api(ctx, h, `records/${record.id}/restore`, { expectedRevision: 2 });
    assert.equal((await api(ctx, h, `tags/${firstTag.id}/records`)).json().total, 2);
    await api(ctx, h, `records/${record.id}/trash`, { expectedRevision: 3 });
    ctx.recorderDatabase.raw.exec(`CREATE TRIGGER isolated_block_empty BEFORE DELETE ON records_entries BEGIN SELECT RAISE(ABORT, 'isolated rollback'); END`);
    assert.equal((await api(ctx, h, 'records/trash/empty', { confirm: true })).statusCode, 500);
    assert.deepEqual((await api(ctx, h, `records/${record.id}/tags`)).json().items, [firstTag]);
    ctx.recorderDatabase.raw.exec('DROP TRIGGER isolated_block_empty');
    await ctx.loader.update('tag-store', { disabled: true }); await ctx.loader.await();
    assert.equal((await api(ctx, h, 'tags')).statusCode, 503);
    assert.equal((await api(ctx, h, 'records/trash/empty', { confirm: true })).json().deleted, 1, 'Record cleanup works without tag provider');
    assert.deepEqual(ctx.recorderDatabase.raw.prepare('SELECT * FROM tags_record_links WHERE record_id=?').all(record.id), []);
    await ctx.loader.update('tag-store', { disabled: false }); await ctx.loader.await();
    assert.equal((await api(ctx, h, 'tags')).json().items.length, 3);
    assert.equal((await api(ctx, h, `tags/${firstTag.id}/records`)).json().total, 1);
    assert.deepEqual((await api(ctx, h, 'records/' + second.id)).json(), second);
    assert.deepEqual(ctx.recorderDatabase.raw.pragma('foreign_key_check'), []);
  } finally { await ctx.fiber.dispose(); await f.cleanup(); }
});

test('tag APIs enforce ownership, authenticated channels, strict input/OpenAPI, and independent provider lifecycle', async () => {
  const ctx = await createApplication({ filename: ':memory:', setupCode, http: { listen: false } });
  try {
    const h = await owner(ctx), otherId = randomUUID(), token = ctx.recorderCrypto.token();
    ctx.recorderDatabase.raw.prepare('INSERT INTO identity_users VALUES(?,?,?,?,?)').run(otherId, 'other', 'sample-hash', 2, 1);
    ctx.recorderIdentityStore.createSession({ id: randomUUID(), userId: otherId, tokenHash: ctx.recorderCrypto.digest(token), channel: 'native', clientName: 'other', createdAt: 1, expiresAt: Date.now() + 60000 });
    const other = { ...native, authorization: 'Bearer ' + token };
    const record = (await api(ctx, h, 'records', recordInput())).json<RecordData>();
    const tag = (await api(ctx, h, 'tags', { name: 'same' })).json<TagData>();
    const otherTag = (await api(ctx, other, 'tags', { name: 'same' })).json<TagData>(); assert.notEqual(tag.id, otherTag.id);
    for (const action of ['add', 'remove']) {
      assert.equal((await api(ctx, h, `records/${record.id}/tags/${action}`, { tagId: otherTag.id })).statusCode, 404);
      assert.equal((await api(ctx, other, `records/${record.id}/tags/${action}`, { tagId: otherTag.id })).statusCode, 404);
      assert.equal((await api(ctx, native, `records/${record.id}/tags/${action}`, { tagId: tag.id })).statusCode, 401);
      assert.equal((await api(ctx, h, `records/${randomUUID()}/tags/${action}`, { tagId: tag.id })).statusCode, 404);
      assert.equal((await api(ctx, h, `records/${record.id}/tags/${action}`, { tagId: tag.id, ownerId: otherId })).statusCode, 400);
    }
    assert.equal((await api(ctx, other, `records/${record.id}/tags`)).statusCode, 404);
    assert.equal((await api(ctx, other, `tags/${tag.id}/records`)).statusCode, 404);
    assert.deepEqual((await api(ctx, other, 'tags')).json().items, [otherTag]);
    for (const name of ['', '  ', 'a'.repeat(65), 123, null, true]) assert.equal((await api(ctx, h, 'tags', { name })).statusCode, 400, String(name));
    assert.equal((await api(ctx, h, 'tags', { name: '  ' + 'a'.repeat(64) + '  ' })).statusCode, 200);
    for (const query of ['limit=0', 'limit=101', 'offset=-1', 'offset=1.5', 'state=trash']) assert.equal((await api(ctx, h, `tags/${tag.id}/records?${query}`)).statusCode, 400);
    const web = await api(ctx, { origin: 'http://127.0.0.1:5173', 'x-recorder-request': '1' }, 'auth/login', { username: 'owner', password: 'correct horse battery staple', remember: false, clientName: 'web' });
    const wh = { origin: 'http://127.0.0.1:5173', 'x-recorder-request': '1', cookie: String(web.headers['set-cookie']).split(';')[0]! };
    assert.equal((await api(ctx, wh, 'tags', { name: 'csrf' })).statusCode, 403);
    assert.equal((await api(ctx, { ...wh, 'x-csrf-token': String(web.headers['x-csrf-token']) }, 'tags', { name: 'csrf' })).statusCode, 200);
    assert.equal((await api(ctx, { ...h, origin: 'http://untrusted.example' }, 'tags', { name: 'bad' })).statusCode, 403);
    const openapi = (await ctx.recorderHttp.server.inject({ url: '/openapi.json' })).json();
    const add = openapi.paths['/api/v1/records/{id}/tags/add'].post;
    assert.equal(add.operationId, 'addRecordTag'); assert.deepEqual(add.requestBody.content['application/json'].schema.required, ['tagId']); assert.ok(add.responses['409']);
    assert.ok(openapi.paths['/api/v1/tags/{id}/records'].get.parameters.some((p: any) => p.name === 'q'));
    await ctx.loader.update('tags', { disabled: true }); await ctx.loader.await();
    assert.equal((await api(ctx, h, 'tags')).statusCode, 503);
    assert.equal((await api(ctx, h, 'records/' + record.id)).statusCode, 200);
    assert.equal((await ctx.recorderHttp.server.inject({ method: 'PUT', url: '/api/v1/records/' + record.id, headers: h, payload: { expectedRevision: 1, title: 'edited', body: 'still works', format: 'plain' } })).statusCode, 200);
    assert.equal((await api(ctx, h, `records/${record.id}/trash`, { expectedRevision: 2 })).statusCode, 200);
    assert.equal((await api(ctx, h, `records/${record.id}/restore`, { expectedRevision: 3 })).statusCode, 200);
    await ctx.loader.update('tags', { disabled: false }); await ctx.loader.await();
    assert.equal((await api(ctx, h, 'tags')).statusCode, 200);
  } finally { await ctx.fiber.dispose(); }
});

test('T01 production database upgrades only after CLI confirmation and recovery point, preserving active/trash/revisions and prior SQL', async () => {
  const f = await sample(), raw = new Database(f.filename), ownerId = randomUUID();
  const before = { records: [] as unknown[], ledger: [] as unknown[] };
  try {
    raw.exec(ledgerSql);
    const digests = ['b4407f95f083733826bd9b100622547696fb812b2c41102da0e47038952a63e3', '9232a42a20abfcca4a7e9f76b196efad4e355507bba7e002077e760a9cec2145', '5cfbbbe2224e483beb33f97b020936c7f55b00a5ac0b06563f96465347287d9c'];
    for (const [i, step] of installedMigrations.filter(s => ['identity', 'records'].includes(s.namespace)).entries()) {
      const text = await readFile(new URL('../migrations/' + step.file, import.meta.url), 'utf8'), digest = createHash('sha256').update(text).digest('hex');
      assert.equal(digest, digests[i], 'Previously applied SQL stays byte-identical');
      raw.exec(text.split('--> statement-breakpoint').join('\n')); raw.prepare('INSERT INTO recorder_migrations VALUES(?,?,?,?)').run(step.namespace, step.revision, digest, 123);
    }
    raw.prepare('INSERT INTO core_instance VALUES(?,1)').run(randomUUID());
    raw.prepare('INSERT INTO identity_users VALUES(?,?,?,?,?)').run(ownerId, 'legacy', 'sample-hash', 1, 1);
    for (const deletedAt of [null, 456]) raw.prepare('INSERT INTO records_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), ownerId, randomUUID(), 'old-request-hash', 'old title', '# old body', 'markdown', 1, 7, 'old-origin', 12, 13, deletedAt);
    before.records = raw.prepare('SELECT * FROM records_entries ORDER BY id').all(); before.ledger = raw.prepare('SELECT * FROM recorder_migrations').all();
  } finally { raw.close(); }
  let app: App | undefined;
  try {
    await assert.rejects(createApplication({ filename: f.filename, http: { listen: false } }), { code: 'UPGRADE_REQUIRED' });
    const inspect = await cli(f.filename, 'inspect'); assert.equal(inspect.code, 0, inspect.error);
    const plan = JSON.parse(inspect.output.trim()).plan; assert.deepEqual(plan.steps.map((s: any) => [s.namespace, s.revision]), [['attachments', 1], ['categories', 1], ['tags', 1]]);
    assert.equal((await cli(f.filename, 'upgrade')).code, 2);
    const upgrade = await cli(f.filename, 'upgrade', ['--confirm', plan.digest]); assert.equal(upgrade.code, 0, upgrade.error);
    const points = await cli(f.filename, 'points'); assert.equal(points.code, 0, points.error);
    const point = JSON.parse(points.output.trim()).valid[0]; assert.equal(point.manifest.ledger.length, 3); assert.equal(point.manifest.plan.digest, plan.digest);
    app = await createApplication({ filename: f.filename, http: { listen: false } });
    assert.deepEqual(app.recorderDatabase.raw.prepare('SELECT * FROM records_entries ORDER BY id').all(), before.records);
    assert.deepEqual(app.recorderDatabase.raw.prepare("SELECT * FROM recorder_migrations WHERE namespace IN ('identity','records')").all(), before.ledger);
    assert.equal(app.recorderRecordStore.list(ownerId, '', 30, 0).total, 1); assert.equal(app.recorderRecordStore.list(ownerId, '', 30, 0, 'trash').total, 1);
    assert.deepEqual(app.recorderTagStore.list(ownerId), []); assert.deepEqual(app.recorderDatabase.raw.pragma('foreign_key_check'), []);
    assert.equal(app.recorderDatabase.raw.pragma('integrity_check', { simple: true }), 'ok');
  } finally { await app?.fiber.dispose(); await f.cleanup(); }
});
