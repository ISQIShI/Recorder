import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createApplication } from '../dist/application.js';
import { fileRecordUploadPath, attachmentContentPath, attachmentUploadPath } from '@recorder/contracts';
const native = { 'x-recorder-client': 'native', 'x-recorder-request': '1' }, setupCode = 'isolated-file-record-setup-code';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'recorder-file-records-'));
  const app = await createApplication({ dataDir: directory, setupCode, attachments: { maxBytes: 1024 }, http: { port: 0 } });
  const setup = await app.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/setup', headers: native, payload: { username: 'owner', password: 'isolated file record password', clientName: 'file records', remember: false, setupCode } });
  assert.equal(setup.statusCode, 200, setup.body);
  const headers = { ...native, authorization: 'Bearer ' + setup.headers['x-recorder-session'] };
  const api = (path: string, payload?: object, method?: 'PUT') => app.recorderHttp.server.inject({ method: method ?? (payload ? 'POST' : 'GET'), url: '/api/v1/' + path, headers, ...(payload ? { payload } : {}) });
  async function upload(id: string, data = 'file bytes', name = '文件.txt', auth: Record<string, string> = headers) {
    const response = await fetch(new URL(fileRecordUploadPath(id), app.recorderHttp.address), { method: 'PUT', credentials: 'omit', headers: { ...auth, 'content-type': 'application/octet-stream', 'x-recorder-filename': encodeURIComponent(name) }, body: Readable.from([data]) as any, duplex: 'half' } as RequestInit);
    return { status: response.status, body: await response.json() as any };
  }
  const count = () => (app.recorderDatabase.raw.prepare('SELECT count(*) AS n FROM records_entries').get() as any).n;
  return { app, headers, api, upload, count, async close() { await app.fiber.dispose(); const target = resolve(directory); assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith('recorder-file-records-')); await rm(target, { recursive: true, force: true }); } };
}
async function until(check: () => boolean) { const end = Date.now() + 10000; while (!check()) { if (Date.now() > end) throw new Error('File record timeout'); await new Promise(r => setTimeout(r, 20)); } }

test('file records commit once, preserve blank-body edits/conflicts and normal organization/trash semantics', async () => {
  const f = await fixture();
  try {
    const id = randomUUID(), name = 'a'.repeat(199) + '😀' + '.txt';
    const first = await f.upload(id, 'file bytes', name); assert.equal(first.status, 200, JSON.stringify(first));
    const { record, attachment } = first.body;
    assert.equal(record.body, ''); assert.equal(record.format, 'plain'); assert.equal(record.title, 'a'.repeat(199)); assert.equal(record.revision, 1); assert.equal(attachment.name, name);
    assert.equal(attachment.digest, createHash('sha256').update('file bytes').digest('hex'));
    assert.equal(f.count(), 1); assert.equal((await f.upload(id, 'file bytes', name)).body.record.id, record.id); assert.equal(f.count(), 1);
    assert.equal((await f.upload(id, 'different', name)).status, 409); assert.equal((await f.upload(id, 'file bytes', 'different')).status, 409);
    const download = await fetch(new URL(attachmentContentPath(attachment.id), f.app.recorderHttp.address), { headers: f.headers }); assert.equal(await download.text(), 'file bytes');
    assert.equal((await f.api('records', { requestId: id, title: record.title, body: 'text', format: 'plain' })).statusCode, 409, 'file/text requests cannot collide');
    assert.equal((await f.api('records', { requestId: randomUUID(), title: 'empty text', body: '', format: 'plain' })).statusCode, 400);
    const edited = await f.api('records/' + record.id, { expectedRevision: 1, title: '', body: '', format: 'plain' }, 'PUT'); assert.equal(edited.statusCode, 200, edited.body); assert.equal(edited.json().revision, 2);
    const stale = await f.api('records/' + record.id, { expectedRevision: 1, title: 'draft', body: '', format: 'plain' }, 'PUT'); assert.equal(stale.statusCode, 409);
    assert.equal((await f.upload(id, 'file bytes', name)).body.record.title, '', 'replay returns current record without resetting edits');
    const tag = (await f.api('tags', { name: 'file tag' })).json(), category = (await f.api('categories', { name: 'file category', parentId: null })).json();
    assert.equal((await f.api(`records/${record.id}/tags/add`, { tagId: tag.id })).statusCode, 200);
    assert.equal((await f.api(`records/${record.id}/categories/add`, { categoryId: category.id })).statusCode, 200);
    assert.equal((await f.api(`tags/${tag.id}/records`)).json().total, 1); assert.equal((await f.api(`categories/${category.id}/records`)).json().total, 1);
    assert.equal((await f.api(`records/${record.id}/trash`, { expectedRevision: 2 })).statusCode, 200); assert.equal((await f.upload(id, 'file bytes', name)).status, 409);
    assert.equal((await f.api(`records/${record.id}/attachments`)).json().items.length, 1);
    assert.equal((await f.api(`records/${record.id}/restore`, { expectedRevision: 3 })).statusCode, 200);
    assert.equal((await f.api(`records/${record.id}/tags`)).json().items.length, 1); assert.equal((await f.api(`records/${record.id}/categories`)).json().items.length, 1);
    assert.equal((await f.api(`attachments/${attachment.id}/delete`, { confirm: true })).statusCode, 200); assert.equal(f.count(), 1); assert.equal((await f.api(`records/${record.id}`)).json().body, '');
    assert.equal((await f.upload(id, 'file bytes', name)).status, 409, 'removed successful upload cannot create a second record');
    const secondId = randomUUID(), second = await f.upload(secondId); assert.equal(second.status, 200);
    await f.api(`records/${second.body.record.id}/trash`, { expectedRevision: 1 }); await f.api('records/trash/empty', { confirm: true }); assert.equal(f.count(), 1); assert.equal((await f.upload(secondId)).status, 409);
    const spec = (await f.app.recorderHttp.server.inject('/openapi.json')).json();
    assert.equal(spec.paths['/api/v1/file-records/{uploadId}/content'].put.operationId, 'createFileRecord');
  } finally { await f.close(); }
});

test('failed/interrupted file creation leaves no record; final attachment failure rolls back record insert; auth and retries remain scoped', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.upload(randomUUID(), 'bytes', 'file', native)).status, 401);
    assert.equal((await f.upload(randomUUID(), 'bytes', 'file', { ...f.headers, origin: 'https://invalid.example' })).status, 403);
    assert.equal((await f.upload(randomUUID(), 'x'.repeat(1025))).status, 413); assert.equal(f.count(), 0);
    const interrupted = randomUUID();
    await new Promise<void>((done, fail) => { const req = request(new URL(fileRecordUploadPath(interrupted), f.app.recorderHttp.address), { method: 'PUT', headers: { ...f.headers, 'content-type': 'application/octet-stream', 'x-recorder-filename': encodeURIComponent('文件.txt') } }); req.on('error', () => done()); req.write('partial'); void until(() => !!f.app.recorderDatabase.raw.prepare('SELECT 1 FROM attachments_objects WHERE id=?').get(interrupted)).then(() => { assert.equal(f.count(), 0); req.destroy(); }, fail); });
    await until(() => (f.app.recorderDatabase.raw.prepare('SELECT state FROM attachments_objects WHERE id=?').get(interrupted) as any)?.state === 'deleted'); assert.equal(f.count(), 0);
    const fault = randomUUID();
    f.app.recorderDatabase.raw.exec("CREATE TRIGGER fail_file_commit BEFORE UPDATE OF state ON attachments_objects WHEN NEW.state='ready' BEGIN SELECT RAISE(ABORT,'isolated commit failure'); END");
    assert.equal((await f.upload(fault)).status, 500); assert.equal(f.count(), 0, 'record insertion rolls back with attachment commit');
    f.app.recorderDatabase.raw.exec('DROP TRIGGER fail_file_commit');
    const saved = await f.upload(fault); assert.equal(saved.status, 200, JSON.stringify(saved)); assert.equal(f.count(), 1);
    assert.equal((await f.upload(fault)).body.record.id, saved.body.record.id); assert.equal(f.count(), 1);
    const retry = await f.upload(interrupted); assert.equal(retry.status, 200); assert.equal(f.count(), 2);
    const regular = await fetch(new URL(attachmentUploadPath(saved.body.record.id, interrupted), f.app.recorderHttp.address), { method: 'PUT', headers: { ...f.headers, 'content-type': 'application/octet-stream', 'x-recorder-filename': encodeURIComponent('文件.txt') }, body: 'file bytes' }); assert.equal(regular.status, 409); await regular.text();
    const web = await f.app.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: f.app.recorderHttp.address, 'x-recorder-request': '1' }, payload: { username: 'owner', password: 'isolated file record password', remember: false, clientName: 'file Web' } });
    assert.equal(web.statusCode, 200, web.body);
    const webHeaders = { origin: f.app.recorderHttp.address, cookie: String(web.headers['set-cookie']).split(';')[0]!, 'x-recorder-request': '1' };
    assert.equal((await f.upload(randomUUID(), 'bytes', 'web.bin', webHeaders)).status, 403); assert.equal(f.count(), 2);
    assert.equal((await f.upload(randomUUID(), 'bytes', 'web.bin', { ...webHeaders, 'x-csrf-token': String(web.headers['x-csrf-token']) })).status, 200); assert.equal(f.count(), 3);
    const revokedId = randomUUID(); let finish!: () => void; const gate = new Promise<void>(r => { finish = r; });
    const outstanding = fetch(new URL(fileRecordUploadPath(revokedId), f.app.recorderHttp.address), { method: 'PUT', credentials: 'omit', headers: { ...f.headers, 'content-type': 'application/octet-stream', 'x-recorder-filename': 'revoked.bin' }, body: Readable.from((async function* () { yield 'start'; await gate; yield 'finish'; })()) as any, duplex: 'half' } as RequestInit);
    await until(() => !!f.app.recorderDatabase.raw.prepare('SELECT 1 FROM attachments_objects WHERE id=?').get(revokedId)); assert.equal(f.count(), 3);
    assert.equal((await f.upload(revokedId, 'bytes', 'revoked.bin')).status, 409, 'concurrent same request is reserved before async I/O');
    const principal = f.app.recorderAuth.authenticate(f.headers.authorization.slice(7), 'native'); f.app.recorderIdentityStore.revoke(principal.userId, principal.sessionId, Date.now()); finish(); const revoked = await outstanding; assert.equal(revoked.status, 401); await revoked.text(); assert.equal(f.count(), 3, 'final revoked session cannot create a record');
    const login = await f.app.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/auth/login', headers: native, payload: { username: 'owner', password: 'isolated file record password', remember: false, clientName: 'next session' } }); assert.equal(login.statusCode, 200, login.body); f.headers.authorization = 'Bearer ' + login.headers['x-recorder-session'];
    await f.app.loader.update('attachments', { disabled: true }); await f.app.loader.await(); assert.equal((await f.upload(randomUUID())).status, 503); assert.equal((await f.api('records')).json().total, 3);
  } finally { await f.close(); }
});
