import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../dist/application.js';
import { Context } from '@deepseek-ai/cordis';
import * as database from '../dist/plugins/database.js';
import * as migrations from '../dist/plugins/migrations.js';
import * as identityStore from '../dist/plugins/identity-store.js';
import * as recordStore from '../dist/plugins/record-store.js';
import * as crypto from '../dist/plugins/crypto.js';
import { installedMigrations } from '../dist/data/migration-manifest.js';
import type { RecordData } from '@recorder/contracts';

const setupCode = 'isolated-record-edit-setup-code';
const credentials = { username: 'owner', password: 'correct horse battery staple', remember: true, clientName: 'Record edit test' };
const native = { 'x-recorder-client': 'native', 'x-recorder-request': '1' };
const options = { setupCode, http: { listen: false } };
type App = Awaited<ReturnType<typeof createApplication>>;
async function owner(ctx: App) {
  const result = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/setup', headers: native, payload: { ...credentials, setupCode } });
  assert.equal(result.statusCode, 200, result.body);
  return { ...native, authorization: 'Bearer ' + result.headers['x-recorder-session'] };
}
function put(ctx: App, id: string, payload: object, headers: Record<string, string>) {
  return ctx.recorderHttp.server.inject({ method: 'PUT', url: '/api/v1/records/' + id, payload, headers });
}
const edit = { expectedRevision: 1, title: '修改后', body: '# 新正文\n<script>source only</script>', format: 'markdown' as const };

test('record edits persist, preserve creation identity/hash, and race across two database connections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recorder-edit-'));
  const config = { ...options, filename: join(directory, 'data.sqlite') };
  let ctx = await createApplication(config);
  try {
    const headers = await owner(ctx);
    for (const format of ['plain', 'markdown'] as const) {
      const input = { requestId: randomUUID(), title: '原始', body: '原正文', format };
      const create = () => ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/records', headers, payload: input });
      const created = await create();
      assert.equal(created.statusCode, 200, created.body);
      const before = created.json<RecordData>();
      const original = ctx.recorderDatabase.raw.prepare('SELECT * FROM records_entries WHERE id = ?').get(before.id) as any;
      const changed = await put(ctx, before.id, { ...edit, format: format === 'plain' ? 'markdown' : 'plain' }, headers);
      assert.equal(changed.statusCode, 200, changed.body);
      const after = changed.json<RecordData>();
      assert.deepEqual(after, { ...before, title: edit.title, body: edit.body, format: format === 'plain' ? 'markdown' : 'plain', revision: 2, updatedAt: after.updatedAt });
      assert.ok(after.updatedAt >= before.updatedAt);
      assert.ok(after.updatedAt >= after.createdAt);
      const stored = ctx.recorderDatabase.raw.prepare('SELECT * FROM records_entries WHERE id = ?').get(before.id) as any;
      for (const key of ['id', 'owner_id', 'created_at', 'origin_instance_id', 'request_id', 'request_hash', 'format_version']) assert.equal(stored[key], original[key], key);
      assert.deepEqual((await create()).json(), after, 'original create replay returns current representation');
      assert.equal((await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/records', headers, payload: { ...input, body: edit.body } })).statusCode, 409);
      assert.equal((await put(ctx, before.id, edit, headers)).statusCode, 409, 'lost-response retry keeps original revision');
      assert.deepEqual((await ctx.recorderHttp.server.inject({ url: '/api/v1/records/' + before.id, headers })).json(), after);

      // Two managed connections share this host's ownership. A second independent host is now refused.
      const peer = new Context(), ownership = ctx.recorderDatabaseOwnership;
      await peer.plugin({ apply(scope: Context) { scope.provide('recorderDatabaseOwnership', ownership); } });
      await peer.plugin(database, { filename: config.filename });
      await peer.plugin(migrations, { sources: installedMigrations });
      await peer.plugin(crypto);
      await peer.plugin(identityStore); await peer.plugin(recordStore);
      try {
        const peerUpdate = async () => {
          try {
            const record = peer.recorderRecordStore.update(original.owner_id, { ...edit, id: before.id, expectedRevision: 2, body: 'competing B' }, Date.now());
            return { statusCode: 200, json: <T = RecordData>() => record as T };
          } catch (error) {
            const failure = error as { statusCode: number; code: string };
            return { statusCode: failure.statusCode, json: <T = { code: string }>() => ({ code: failure.code }) as T };
          }
        };
        const results = await Promise.all([
          put(ctx, before.id, { ...edit, expectedRevision: 2, body: 'competing A' }, headers),
          peerUpdate(),
        ]);
        assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
        assert.equal(results.find(r => r.statusCode === 409)!.json().code, 'REVISION_CONFLICT');
        const winner = results.find(r => r.statusCode === 200)!.json<RecordData>();
        assert.equal(winner.revision, 3);
        const unchanged = await put(ctx, before.id, { ...winner, id: undefined, requestId: undefined }, headers);
        assert.equal(unchanged.statusCode, 400);
        const staleSame = await put(ctx, before.id, { ...edit, expectedRevision: 2, body: winner.body }, headers);
        assert.equal(staleSame.statusCode, 409, 'identical content still requires current revision');
        assert.deepEqual((await ctx.recorderHttp.server.inject({ url: '/api/v1/records/' + before.id, headers })).json(), winner);
        await peer.fiber.dispose(); // Release the second handle's ownership lease before stopping the host.
        await ctx.fiber.dispose();
        ctx = await createApplication(config);
        assert.deepEqual((await ctx.recorderHttp.server.inject({ url: '/api/v1/records/' + before.id, headers })).json(), winner);
        const same = await put(ctx, before.id, { expectedRevision: 3, title: winner.title, body: winner.body, format: winner.format }, headers);
        assert.equal(same.statusCode, 200, same.body);
        assert.equal(same.json().revision, 4, 'successful unchanged submission increments revision');
        assert.equal((await create()).json().revision, 4);
      } finally { await peer.fiber.dispose(); }
    }
    const list = await ctx.recorderHttp.server.inject({ url: '/api/v1/records?q=competing&limit=10&offset=0', headers });
    assert.equal(list.statusCode, 200, list.body);
    assert.equal(list.json().total, 2);
  } finally {
    await ctx.fiber.dispose();
    for (const name of await readdir(directory)) await unlink(join(directory, name));
    await rmdir(directory);
  }
});

test('PUT authenticates, isolates owners, rejects malformed inputs and describes its wire contract', async () => {
  const ctx = await createApplication({ ...options, filename: ':memory:' });
  try {
    const headers = await owner(ctx);
    const created = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/records', headers, payload: { requestId: randomUUID(), title: '', body: 'original', format: 'plain' } });
    const before = created.json<RecordData>();
    assert.equal((await put(ctx, before.id, edit, native)).statusCode, 401);
    assert.equal((await put(ctx, randomUUID(), edit, headers)).statusCode, 404);
    const otherId = randomUUID(), otherToken = ctx.recorderCrypto.token();
    ctx.recorderDatabase.raw.prepare('INSERT INTO identity_users VALUES (?, ?, ?, ?, ?)').run(otherId, 'other', 'test-only-hash', 2, Date.now());
    ctx.recorderIdentityStore.createSession({ id: randomUUID(), userId: otherId, tokenHash: ctx.recorderCrypto.digest(otherToken), channel: 'native', clientName: 'other', createdAt: Date.now(), expiresAt: Date.now() + 60000 });
    const otherHeaders = { ...native, authorization: 'Bearer ' + otherToken };
    const hidden = await put(ctx, before.id, edit, otherHeaders);
    assert.equal(hidden.statusCode, 404);
    assert.equal(hidden.json().code, 'NOT_FOUND');
    assert.equal((await ctx.recorderHttp.server.inject({ url: '/api/v1/records/' + before.id, headers: otherHeaders })).statusCode, 404);
    for (const expectedRevision of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', true, null, [], {}]) {
      const result = await put(ctx, before.id, { ...edit, expectedRevision }, headers);
      assert.equal(result.statusCode, 400, JSON.stringify({ expectedRevision, result: result.body }));
    }
    for (const extra of [{ id: before.id }, { ownerId: otherId }, { owner: otherId }, { requestId: randomUUID() }, { revision: 8 }, { createdAt: 0 }, { updatedAt: 0 }, { originInstanceId: randomUUID() }, { formatVersion: 2 }]) {
      assert.equal((await put(ctx, before.id, { ...edit, ...extra }, headers)).statusCode, 400);
    }
    for (const changes of [{ body: ' \n\t' }, { body: 'x'.repeat(200001) }, { body: '😀'.repeat(100001) }, { body: 123 }, { title: 'x'.repeat(201) }, { title: '😀'.repeat(101) }, { title: null }, { format: 'html' }]) {
      assert.equal((await put(ctx, before.id, { ...edit, ...changes }, headers)).statusCode, 400);
    }
    for (const id of ['not-a-uuid', encodeURIComponent('../auth/logout')]) assert.equal((await put(ctx, id, edit, headers)).statusCode, 400);
    assert.deepEqual((await ctx.recorderHttp.server.inject({ url: '/api/v1/records/' + before.id, headers })).json(), before, 'all rejected updates leave record unchanged');
    const principal = ctx.recorderAuth.authenticate(headers.authorization.slice(7), 'native');
    assert.throws(() => ctx.recorderRecords.update(principal, { ...edit, id: before.id, expectedRevision: 0 }), { code: 'INVALID_INPUT' });
    assert.throws(() => ctx.recorderRecords.update(principal, { ...edit, id: before.id, body: ' ' }), { code: 'INVALID_RECORD' });
    const api = (await ctx.recorderHttp.server.inject('/openapi.json')).json();
    const route = api.paths['/api/v1/records/{id}'].put;
    assert.equal(route.operationId, 'updateRecord');
    assert.equal(route.parameters.length, 1);
    assert.deepEqual(route.parameters[0], { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' } });
    const schema = route.requestBody.content['application/json'].schema;
    assert.deepEqual(schema.required, ['expectedRevision', 'title', 'body', 'format']);
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.id, undefined);
    assert.equal(schema.properties.expectedRevision.maximum, Number.MAX_SAFE_INTEGER);
    for (const status of [200, 400, 401, 403, 404, 409, 503]) assert.ok(route.responses[status]);
    assert.ok(api.paths['/api/v1/records/{id}'].get);
  } finally { await ctx.fiber.dispose(); }
});

test('PUT enforces Cookie/Origin/CSRF and native credential channel separation', async () => {
  const ctx = await createApplication({ ...options, filename: ':memory:' });
  try {
    const origin = 'http://127.0.0.1:5173';
    const web = { origin, 'x-recorder-request': '1' };
    const setup = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/setup', headers: web, payload: { ...credentials, setupCode } });
    assert.equal(setup.statusCode, 200, setup.body);
    const cookie = String(setup.headers['set-cookie']).split(';')[0]!;
    const csrf = String(setup.headers['x-csrf-token']);
    const headers = { ...web, cookie, 'x-csrf-token': csrf };
    const created = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/records', headers, payload: { requestId: randomUUID(), title: '', body: 'web', format: 'plain' } });
    assert.equal(created.statusCode, 200, created.body);
    const id = created.json().id;
    for (const [changes, status, code] of [
      [{ origin: '' }, 403, 'ORIGIN_REQUIRED'], [{ origin: 'https://attacker.example' }, 403, 'INVALID_ORIGIN'],
      [{ host: 'attacker.example' }, 403, 'INVALID_HOST'], [{ 'x-recorder-request': '' }, 403, 'INVALID_REQUEST'],
      [{ 'x-csrf-token': '' }, 403, 'CSRF_REJECTED'], [{ 'x-csrf-token': 'wrong' }, 403, 'CSRF_REJECTED'],
      [{ authorization: 'Bearer anything' }, 400, 'AMBIGUOUS_CREDENTIALS'],
      [{ cookie: cookie + '; ' + cookie }, 400, 'AMBIGUOUS_CREDENTIALS'],
      [{ origin: '', 'x-recorder-client': 'native' }, 400, 'INVALID_CREDENTIALS_MODE'],
    ] as [Record<string, string>, number, string][]) {
      const result = await put(ctx, id, edit, { ...headers, ...changes });
      assert.equal(result.statusCode, status, result.body);
      assert.equal(result.json().code, code);
    }
    const changed = await put(ctx, id, edit, headers);
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(changed.headers['x-recorder-session'], undefined);
    assert.equal(changed.headers['x-csrf-token'], csrf);
    const login = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/login', headers: native, payload: credentials });
    const bearer = { ...native, authorization: 'Bearer ' + login.headers['x-recorder-session'] };
    assert.equal((await put(ctx, id, { ...edit, expectedRevision: 2 }, { ...web, authorization: bearer.authorization })).statusCode, 400);
    assert.equal((await put(ctx, id, { ...edit, expectedRevision: 2 }, { ...native, authorization: 'Bearer ' + cookie.slice('recorder_session='.length) })).statusCode, 401);
    const updated = await put(ctx, id, { ...edit, expectedRevision: 2, format: 'plain' }, bearer);
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().revision, 3);
    assert.equal(updated.headers['x-csrf-token'], undefined);
    ctx.recorderAuth.revoke(ctx.recorderAuth.authenticate(bearer.authorization.slice(7), 'native'), login.json().sessionId);
    assert.equal((await put(ctx, id, { ...edit, expectedRevision: 3 }, bearer)).statusCode, 401);
  } finally { await ctx.fiber.dispose(); }
});

test('Cordis withdraws and restores update operations without deleting data or bypassing authentication', async () => {
  const ctx = await createApplication({ ...options, filename: ':memory:' });
  try {
    const headers = await owner(ctx);
    const created = await ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/records', headers, payload: { requestId: randomUUID(), title: '', body: 'retained', format: 'plain' } });
    const id = created.json().id;
    for (const plugin of ['records-api', 'records', 'record-store']) {
      await ctx.loader.update(plugin, { disabled: true }); await ctx.loader.await();
      const result = await put(ctx, id, edit, headers);
      assert.equal(result.statusCode, 503, plugin + ': ' + result.body);
      assert.equal(result.json().code, 'PLUGIN_UNAVAILABLE');
      assert.equal((await put(ctx, id, edit, native)).statusCode, 401);
      await ctx.loader.update(plugin, { disabled: false }); await ctx.loader.await();
      const restored = await ctx.recorderHttp.server.inject({ url: '/api/v1/records/' + id, headers });
      assert.equal(restored.statusCode, 200, restored.body);
      assert.equal(restored.json().body, 'retained');
      assert.equal(restored.json().revision, 1);
    }
    assert.equal((await put(ctx, id, edit, headers)).statusCode, 200);
    await ctx.loader.update('auth', { disabled: true }); await ctx.loader.await();
    assert.equal(ctx.get('recorderHttp'), undefined);
    await ctx.loader.update('auth', { disabled: false }); await ctx.loader.await();
    assert.equal((await put(ctx, id, { ...edit, expectedRevision: 2 }, native)).statusCode, 401);
    assert.equal((await put(ctx, id, { ...edit, expectedRevision: 2 }, headers)).statusCode, 200);
  } finally { await ctx.fiber.dispose(); }
});
