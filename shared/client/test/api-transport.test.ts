import assert from 'node:assert/strict';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { ApiError, parseApiResponse, type RecordData } from '@recorder/contracts';
import { apiRequest, webApi, nativeApi } from '../dist/api-transport.js';

const id = '12345678-1234-4123-8123-123456789abc';
const input = { id, expectedRevision: 1, title: '中文 + &', body: '# source\n😀 <script>text</script>', format: 'markdown' as const };
const record: RecordData = { id, requestId: id, title: input.title, body: input.body, format: input.format,
  revision: 2, formatVersion: 1, createdAt: 100, updatedAt: 200, originInstanceId: id, deletedAt: null };
const body = { expectedRevision: 1, title: input.title, body: input.body, format: input.format };

test('shared HTTP encoder splits path/body and preserves GET/POST shapes', () => {
  assert.deepEqual(apiRequest('updateRecord', input), { path: '/api/v1/records/' + id, method: 'PUT', body: JSON.stringify(body) });
  assert.deepEqual(apiRequest('getRecord', { id }), { path: '/api/v1/records/' + id, method: 'GET' });
  assert.equal(apiRequest('getRecord', { id: '../auth/logout?x=1' }).path, '/api/v1/records/..%2Fauth%2Flogout%3Fx%3D1');
  assert.deepEqual(apiRequest('listRecords', { q: '中文 + &', limit: 5 }), { path: '/api/v1/records?q=%E4%B8%AD%E6%96%87+%2B+%26&limit=5', method: 'GET' });
  const create = { requestId: id, title: input.title, body: input.body, format: input.format };
  assert.deepEqual(apiRequest('createRecord', create), { path: '/api/v1/records', method: 'POST', body: JSON.stringify(create) });
  assert.deepEqual(parseApiResponse('updateRecord', record), record);
  assert.throws(() => parseApiResponse('updateRecord', { ...record, revision: '2' }), { code: 'INVALID_RESPONSE' });
  for (const [method, suffix] of [['trashRecord', 'trash'], ['restoreRecord', 'restore']] as const) {
    assert.deepEqual(apiRequest(method, { id, expectedRevision: 2 }), { path: '/api/v1/records/' + id + '/' + suffix, method: 'POST', body: '{"expectedRevision":2}' });
    assert.deepEqual(parseApiResponse(method, { ...record, deletedAt: 200 }), { ...record, deletedAt: 200 });
    assert.throws(() => parseApiResponse(method, { ...record, deletedAt: undefined }), { code: 'INVALID_RESPONSE' });
  }
  assert.equal(apiRequest('listRecords', { state: 'trash', offset: 30 }).path, '/api/v1/records?state=trash&offset=30');
  assert.deepEqual(apiRequest('emptyTrash', { confirm: true }), { path: '/api/v1/records/trash/empty', method: 'POST', body: '{"confirm":true}' });
  assert.deepEqual(parseApiResponse('emptyTrash', { deleted: 2 }), { deleted: 2 });
  assert.throws(() => parseApiResponse('emptyTrash', { deleted: -1 }), { code: 'INVALID_RESPONSE' });
  for (const method of ['addRecordTag', 'removeRecordTag'] as const) {
    assert.deepEqual(apiRequest(method, { id, tagId: id }), { path: `/api/v1/records/${id}/tags/${method === 'addRecordTag' ? 'add' : 'remove'}`, method: 'POST', body: JSON.stringify({ tagId: id }) });
    assert.deepEqual(parseApiResponse(method, { ok: true }), { ok: true });
    assert.throws(() => parseApiResponse(method, { ok: false }), { code: 'INVALID_RESPONSE' });
  }
  assert.equal(apiRequest('listTagRecords', { id, q: '中文 + &', limit: 30, offset: 30 }).path, `/api/v1/tags/${id}/records?q=%E4%B8%AD%E6%96%87+%2B+%26&limit=30&offset=30`);
  const tag = { id, name: '标签', createdAt: 1 };
  assert.deepEqual(parseApiResponse('createTag', tag), tag); assert.deepEqual(parseApiResponse('getRecordTags', { items: [tag] }), { items: [tag] });
  assert.throws(() => parseApiResponse('listTags', { items: [{ ...tag, name: '  ' }] }), { code: 'INVALID_RESPONSE' });
  assert.deepEqual(parseApiResponse('listTagRecords', { items: [record], total: 1 }), { items: [record], total: 1 });
});

test('Web fetch sends PUT JSON with Cookie/CSRF and preserves API errors', async t => {
  const ctx = new Context();
  const requests: { path: string; options: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    requests.push({ path, options });
    if (path === '/api/v1/me') return new Response(JSON.stringify({ userId: id, username: 'owner', sessionId: id, expiresAt: 1000 }), { headers: { 'x-csrf-token': 'csrf-from-server' } });
    return requests.length === 2 ? new Response(JSON.stringify(record))
      : new Response(JSON.stringify({ code: 'REVISION_CONFLICT', message: 'preserve draft' }), { status: 409 });
  });
  try {
    const plugin = await ctx.plugin(webApi);
    await ctx.recorderApi.request('me', {});
    assert.deepEqual(await ctx.recorderApi.request('updateRecord', input), record);
    const sent = requests[1]!;
    assert.equal(sent.path, '/api/v1/records/' + id);
    assert.equal(sent.options.method, 'PUT');
    assert.deepEqual(JSON.parse(String(sent.options.body)), body);
    assert.equal(sent.options.credentials, 'same-origin');
    assert.deepEqual(sent.options.headers, { 'content-type': 'application/json', 'x-recorder-request': '1', 'x-csrf-token': 'csrf-from-server' });
    await assert.rejects(ctx.recorderApi.request('updateRecord', input), { code: 'REVISION_CONFLICT', status: 409, message: 'preserve draft' });
    const signal = sent.options.signal!;
    await plugin.dispose();
    assert.equal(signal.aborted, true);
  } finally { await ctx.fiber.dispose(); }
});

test('native shared transport validates update results and preserves bridge errors', async () => {
  const ctx = new Context();
  try {
    await ctx.plugin(nativeApi, { bridge: { request: async (method, values) => {
      assert.equal(method, 'updateRecord');
      assert.deepEqual(values, input);
      throw new ApiError('REVISION_CONFLICT', 'preserve draft', 409);
    } } });
    await assert.rejects(ctx.recorderApi.request('updateRecord', input), { code: 'REVISION_CONFLICT', status: 409 });
  } finally { await ctx.fiber.dispose(); }
});

test('Web tag requests use the shared fixed contract, CSRF and response validation', async t => {
  const ctx = new Context(), requests: { path: string; options: RequestInit }[] = [], tag = { id, name: '标签', createdAt: 1 };
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    requests.push({ path, options });
    const value = path.endsWith('/add') || path.endsWith('/remove') ? { ok: true }
      : options.method === 'POST' ? tag : path.includes('/records?') ? { items: [record], total: 1 } : { items: [tag] };
    return new Response(JSON.stringify(value), { headers: { 'x-csrf-token': 'tags-csrf' } });
  });
  try {
    await ctx.plugin(webApi);
    await ctx.recorderApi.request('listTags', {});
    assert.deepEqual(await ctx.recorderApi.request('createTag', { name: ' 标签 ' }), tag);
    await ctx.recorderApi.request('addRecordTag', { id, tagId: id }); await ctx.recorderApi.request('removeRecordTag', { id, tagId: id });
    assert.deepEqual(await ctx.recorderApi.request('getRecordTags', { id }), { items: [tag] });
    assert.deepEqual(await ctx.recorderApi.request('listTagRecords', { id, q: 'body' }), { items: [record], total: 1 });
    assert.deepEqual(JSON.parse(String(requests[1]!.options.body)), { name: ' 标签 ' });
    for (const request of requests.slice(1)) {
      assert.equal(request.options.credentials, 'same-origin'); assert.equal((request.options.headers as Record<string, string>)['x-csrf-token'], 'tags-csrf');
    }
    assert.equal(requests[2]!.path, `/api/v1/records/${id}/tags/add`); assert.equal(requests[5]!.path, `/api/v1/tags/${id}/records?q=body`);
  } finally { await ctx.fiber.dispose(); }
});

test('Electron connection sends fixed PUT through trusted IPC and keeps Bearer in main', async t => {
  // Bundle the real connection plugin, substituting only Electron's host IPC surface.
  // This runs in the ordinary test command without requiring a graphical desktop.
  const result = await build({ stdin: { contents: `export * from ${JSON.stringify(fileURLToPath(new URL('../../../desktop/src/plugins/connection.ts', import.meta.url)))}; export { ipcMain } from 'electron';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'test-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export const ipcMain = { handlers: new Map(), handle(name, fn) { this.handlers.set(name, fn); }, removeHandler(name) { this.handlers.delete(name); } }; export const safeStorage = {}; export const app = {};` }));
      builder.onResolve({ filter: /^@recorder\/contracts$/ }, () => ({ path: fileURLToPath(new URL('../../contracts/src/index.ts', import.meta.url)) }));
    } }] });
  const connection = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0]!.text).toString('base64'));
  const rendererUrl = 'file:///isolated/renderer.html';
  const frame = { url: rendererUrl };
  const webContents = { mainFrame: frame };
  const event = { sender: webContents, senderFrame: frame };
  const requests: { url: URL; options: RequestInit }[] = [];
  let saved: string | undefined = 'private-main-token';
  t.mock.method(globalThis, 'fetch', async (url: URL, options: RequestInit) => {
    requests.push({ url, options });
    if (requests.length === 2) return new Response(JSON.stringify({ code: 'REVISION_CONFLICT', message: 'preserve draft' }), { status: 409 });
    return new Response(JSON.stringify(url.pathname.endsWith('/empty') ? { deleted: 1 } : record));
  });
  const ctx = new Context();
  try {
    await ctx.plugin((owner: Context) => {
      owner.provide('recorderWindow', { webContents } as any);
      owner.provide('recorderCredentials', { load: async () => saved, save: async (_backend: string, value?: string) => { saved = value; } });
    });
    const plugin = await ctx.plugin(connection, { rendererUrl, backendUrl: 'http://127.0.0.1:4317' });
    const handler = connection.ipcMain.handlers.get('recorder:api');
    const received = await handler(event, 'updateRecord', input);
    assert.deepEqual(received, { ok: true, value: record });
    assert.ok(!JSON.stringify(received).includes('private-main-token'));
    const sent = requests[0]!;
    assert.equal(sent.url.href, 'http://127.0.0.1:4317/api/v1/records/' + id);
    assert.equal(sent.options.method, 'PUT');
    assert.deepEqual(JSON.parse(String(sent.options.body)), body);
    assert.equal(sent.options.redirect, 'error');
    assert.deepEqual(sent.options.headers, { 'content-type': 'application/json', 'x-recorder-request': '1', 'x-recorder-client': 'native', authorization: 'Bearer private-main-token' });
    assert.deepEqual(await handler(event, 'updateRecord', input), { ok: false, error: { code: 'REVISION_CONFLICT', message: 'preserve draft', status: 409 } });
    for (const method of ['trashRecord', 'restoreRecord', 'emptyTrash'] as const) {
      const values = method === 'emptyTrash' ? { confirm: true } : { id, expectedRevision: 2 };
      assert.equal((await handler(event, method, values)).ok, true);
      const sent = requests.at(-1)!;
      assert.equal(sent.options.method, 'POST');
      assert.equal(sent.url.pathname, method === 'emptyTrash' ? '/api/v1/records/trash/empty' : '/api/v1/records/' + id + (method === 'trashRecord' ? '/trash' : '/restore'));
      assert.deepEqual(JSON.parse(String(sent.options.body)), method === 'emptyTrash' ? { confirm: true } : { expectedRevision: 2 });
    }
    for (const invalid of [{ ...event, sender: {} }, { ...event, senderFrame: { url: rendererUrl } }, { ...event, senderFrame: { url: 'https://attacker.example' } }]) {
      assert.equal((await handler(invalid, 'updateRecord', input)).error.code, 'INVALID_SENDER');
    }
    assert.equal((await handler(event, 'http://attacker.example', input)).error.code, 'INVALID_REQUEST');
    assert.equal((await handler(event, 'PUT', input)).error.code, 'INVALID_REQUEST');
    assert.equal((await handler(event, 'updateRecord', [])).error.code, 'INVALID_REQUEST');
    assert.equal(requests.length, 5);
    await plugin.dispose();
    assert.equal(connection.ipcMain.handlers.size, 0);
    assert.equal(sent.options.signal!.aborted, true);
  } finally { await ctx.fiber.dispose(); }
});
