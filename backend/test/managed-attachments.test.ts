import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, rename, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { createApplication } from '../dist/application.js';
import { createMaintenance } from '../dist/maintenance-profile.js';
import { installedMigrations } from '../dist/data/migration-manifest.js';
import { ledgerSql } from '../dist/plugins/migrations/plan.js';
import { attachmentUploadPath, attachmentContentPath, type AttachmentData } from '@recorder/contracts';
const setupCode = 'isolated-attachment-setup-code', native = { 'x-recorder-client': 'native', 'x-recorder-request': '1' };
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
type App = Awaited<ReturnType<typeof createApplication>>;
async function sample() { const directory = await mkdtemp(join(tmpdir(), 'recorder-attachments-')); const source = join(directory, 'source'); await mkdir(source); return { directory, filename: join(source, 'data.sqlite'), async cleanup() { const path = resolve(directory); assert.equal(dirname(path), resolve(tmpdir())); assert.ok(basename(path).startsWith('recorder-attachments-')); await rm(path, { recursive: true, force: true }); } }; }
function api(app: App, headers: Record<string, string>, path: string, payload?: object) { return app.recorderHttp.server.inject({ method: payload ? 'POST' : 'GET', url: '/api/v1/' + path, headers, ...(payload ? { payload } : {}) }); }
async function owner(app: App) { const r = await api(app, native, 'auth/setup', { username: 'owner', password: 'isolated attachment password', remember: true, clientName: 'attachment test', setupCode }); assert.equal(r.statusCode, 200, r.body); return { ...native, authorization: 'Bearer ' + r.headers['x-recorder-session'] }; }
async function record(app: App, headers: Record<string, string>) { const r = await api(app, headers, 'records', { requestId: randomUUID(), title: 'Attachment owner', body: 'source text', format: 'plain' }); assert.equal(r.statusCode, 200, r.body); return r.json(); }
async function upload(app: App, headers: Record<string, string>, id: string, bytes: Buffer, uploadId = randomUUID(), name = '样本.bin') { const response = await fetch(new URL(attachmentUploadPath(id, uploadId), app.recorderHttp.address), { method: 'PUT', credentials: 'omit', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-recorder-filename': encodeURIComponent(name) }, body: Readable.from([bytes]) as any, duplex: 'half' } as RequestInit); const body = await response.json(); return { status: response.status, body: body as any }; }
async function until(check: () => boolean) { const deadline = Date.now() + 10000; while (!check()) { if (Date.now() > deadline) throw new Error('Attachment state timeout'); await new Promise(r => setTimeout(r, 20)); } }
function slowUpload(app: App, headers: Record<string, string>, id: string, uploadId = randomUUID()) {
  let finish!: () => void; const gate = new Promise<void>(r => { finish = r; });
  const response = fetch(new URL(attachmentUploadPath(id, uploadId), app.recorderHttp.address), { method: 'PUT', credentials: 'omit', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-recorder-filename': 'slow.bin' }, body: Readable.from((async function* () { yield Buffer.from('start'); await gate; yield Buffer.from('finish'); })()) as any, duplex: 'half' } as RequestInit);
  return { uploadId, finish, response };
}
async function cli(filename: string, command: string, args: string[] = []) { const child = spawn(process.execPath, ['backend/dist/maintenance-cli.js', command, '--database', filename, ...args], { cwd: new URL('../../', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '', error = ''; child.stdout.on('data', v => { output += v; }); child.stderr.on('data', v => { error += v; }); return new Promise<{ code: number | null; output: string; error: string }>((done, fail) => { const timer = setTimeout(() => { child.kill(); fail(new Error('CLI timeout ' + error)); }, 60000); child.on('error', fail); child.on('exit', code => { clearTimeout(timer); done({ code, output, error }); }); }); }

test('streaming attachments enforce auth/owner, actual limits, idempotency, interruption and final session/record checks', async () => {
  const f = await sample(), app = await createApplication({ filename: f.filename, setupCode, attachments: { maxBytes: 1024 }, http: { port: 0 } });
  try {
    const headers = await owner(app), a = await record(app, headers), bytes = Buffer.from('ordinary binary\0\xff');
    assert.equal((await upload(app, native, a.id, bytes)).status, 401);
    assert.equal((await upload(app, { ...headers, origin: 'https://untrusted.invalid' }, a.id, bytes)).status, 403);
    const saved = await upload(app, headers, a.id, bytes); assert.equal(saved.status, 200, JSON.stringify(saved)); assert.equal(saved.body.bytes, bytes.length); assert.equal(saved.body.digest, digest(bytes)); assert.equal('objectId' in saved.body, false);
    assert.equal((await upload(app, headers, a.id, bytes, saved.body.id)).body.id, saved.body.id);
    assert.equal((await upload(app, headers, a.id, Buffer.from('different'), saved.body.id)).status, 409);
    assert.equal((await upload(app, headers, a.id, Buffer.alloc(1025))).status, 413);
    assert.equal((await upload(app, headers, a.id, bytes, randomUUID(), '../path.bin')).status, 400);
    const downloaded = await fetch(new URL(attachmentContentPath(saved.body.id), app.recorderHttp.address), { headers }); assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes); assert.equal(downloaded.headers.get('x-recorder-digest'), digest(bytes));
    const otherId = randomUUID(), token = app.recorderCrypto.token(); app.recorderDatabase.raw.prepare('INSERT INTO identity_users VALUES(?,?,?,?,?)').run(otherId, 'other', 'hash', 2, 1);
    app.recorderIdentityStore.createSession({ id: randomUUID(), userId: otherId, tokenHash: app.recorderCrypto.digest(token), channel: 'native', clientName: 'other', createdAt: 1, expiresAt: Date.now() + 60000 });
    const other = { ...native, authorization: 'Bearer ' + token };
    for (const path of [`records/${a.id}/attachments`, `attachments/${saved.body.id}/delete`]) { const r = await api(app, other, path, path.endsWith('delete') ? { confirm: true } : undefined); assert.equal(r.statusCode, 404, r.body); }
    assert.equal((await upload(app, other, a.id, bytes)).status, 404);
    assert.equal((await fetch(new URL(attachmentContentPath(saved.body.id), app.recorderHttp.address), { headers: other })).status, 404);
    assert.equal((await api(app, headers, 'records/' + a.id)).json().revision, a.revision);
    const web = await api(app, { origin: app.recorderHttp.address, 'x-recorder-request': '1' }, 'auth/login', { username: 'owner', password: 'isolated attachment password', remember: false, clientName: 'Web' });
    const cookie = String(web.headers['set-cookie']).split(';')[0]!, csrf = String(web.headers['x-csrf-token']);
    assert.equal((await upload(app, { origin: app.recorderHttp.address, cookie, 'x-recorder-request': '1' }, a.id, bytes)).status, 403);
    assert.equal((await upload(app, { origin: app.recorderHttp.address, cookie, 'x-csrf-token': csrf, 'x-recorder-request': '1' }, a.id, bytes)).status, 200);
    const interruptedId = randomUUID();
    await new Promise<void>((done, fail) => { const req = httpRequest(new URL(attachmentUploadPath(a.id, interruptedId), app.recorderHttp.address), { method: 'PUT', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-recorder-filename': 'interrupted.bin' } }); req.on('error', () => done()); req.write('partial'); void until(() => !!app.recorderDatabase.raw.prepare('SELECT 1 FROM attachments_objects WHERE id=?').get(interruptedId)).then(() => req.destroy(), fail); });
    await until(() => (app.recorderDatabase.raw.prepare('SELECT state FROM attachments_objects WHERE id=?').get(interruptedId) as any)?.state === 'deleted');
    assert.equal((await upload(app, headers, a.id, bytes, interruptedId, 'interrupted.bin')).status, 200);
    const transport = slowUpload(app, headers, a.id), transportResult = transport.response.catch(() => undefined);
    await until(() => !!app.recorderDatabase.raw.prepare('SELECT 1 FROM attachments_objects WHERE id=?').get(transport.uploadId));
    await app.loader.update('attachments-http', { disabled: true }); await app.loader.await(); transport.finish();
    const transportResponse = await transportResult; if (transportResponse) { assert.ok(transportResponse.status >= 400); await transportResponse.text(); }
    await until(() => (app.recorderDatabase.raw.prepare('SELECT state FROM attachments_objects WHERE id=?').get(transport.uploadId) as any).state === 'deleted');
    await app.loader.update('attachments-http', { disabled: false }); await app.loader.await();
    const withdrawn = slowUpload(app, headers, a.id), withdrawnResult = withdrawn.response.catch(() => undefined);
    await until(() => !!app.recorderDatabase.raw.prepare('SELECT 1 FROM attachments_objects WHERE id=?').get(withdrawn.uploadId));
    await app.loader.update('attachments', { disabled: true }); await app.loader.await(); withdrawn.finish();
    const withdrawnResponse = await withdrawnResult; if (withdrawnResponse) { assert.ok(withdrawnResponse.status >= 400); await withdrawnResponse.text(); }
    await until(() => (app.recorderDatabase.raw.prepare('SELECT state FROM attachments_objects WHERE id=?').get(withdrawn.uploadId) as any).state === 'deleted');
    await app.loader.update('attachments', { disabled: false }); await app.loader.await();
    const retries = await Promise.all(Array.from({ length: 4 }, () => upload(app, headers, a.id, bytes, withdrawn.uploadId, 'slow.bin')));
    assert.ok(retries.some(r => r.status === 200)); assert.ok(retries.every(r => [200, 409].includes(r.status)));
    const inventory = app.recorderManagedFiles.inventory(app.recorderDatabase.raw);
    assert.equal((await readdir(join(app.recorderManagedFiles.root, 'objects'))).length, inventory.length, 'Concurrent retries never leave untracked immutable objects');
    const outstanding = slowUpload(app, headers, a.id); await until(() => !!app.recorderDatabase.raw.prepare('SELECT 1 FROM attachments_objects WHERE id=?').get(outstanding.uploadId));
    assert.equal((await api(app, headers, `attachments/${outstanding.uploadId}/delete`, { confirm: true })).statusCode, 409);
    outstanding.finish(); const completed = await outstanding.response; assert.equal(completed.status, 200); await completed.text();
    const slow = slowUpload(app, headers, a.id); await until(() => !!app.recorderDatabase.raw.prepare('SELECT 1 FROM attachments_objects WHERE id=?').get(slow.uploadId));
    assert.equal((await api(app, headers, `records/${a.id}/trash`, { expectedRevision: 1 })).statusCode, 200); slow.finish(); const rejected = await slow.response; assert.equal(rejected.status, 409); await rejected.text();
    assert.equal((await api(app, headers, `records/${a.id}/attachments`)).json().items.some((item: AttachmentData) => item.id === slow.uploadId), false);
    assert.equal((await upload(app, headers, a.id, bytes)).status, 409); assert.equal((await api(app, headers, `attachments/${saved.body.id}/delete`, { confirm: true })).statusCode, 409);
    await api(app, headers, `records/${a.id}/restore`, { expectedRevision: 2 });
    const revoked = slowUpload(app, headers, a.id); await until(() => !!app.recorderDatabase.raw.prepare('SELECT 1 FROM attachments_objects WHERE id=?').get(revoked.uploadId));
    const principal = app.recorderAuth.authenticate(headers.authorization.slice(7), 'native'); app.recorderIdentityStore.revoke(principal.userId, principal.sessionId, Date.now()); revoked.finish(); const expired = await revoked.response; assert.equal(expired.status, 401); await expired.text();
    assert.equal((app.recorderDatabase.raw.prepare('SELECT state FROM attachments_objects WHERE id=?').get(revoked.uploadId) as any).state, 'deleted');
    const openapi = (await app.recorderHttp.server.inject({ url: '/openapi.json' })).json(); assert.ok(openapi.paths['/api/v1/records/{id}/attachments/{uploadId}/content'].put.requestBody.content['application/octet-stream']);
    assert.ok(openapi.paths['/api/v1/attachments/{id}/content'].get.security.length);
  } finally { await app.fiber.dispose(); await f.cleanup(); }
});

test('persistent cleanup retries failed deletion and record SET NULL intent while attachment business is disabled', async () => {
  const f = await sample(); let app = await createApplication({ filename: f.filename, setupCode, http: { port: 0 } });
  try {
    const h = await owner(app), a = await record(app, h), bytes = Buffer.from('preserved attachment'), saved = await upload(app, h, a.id, bytes); assert.equal(saved.status, 200);
    const object = (app.recorderDatabase.raw.prepare('SELECT object_id FROM attachments_objects WHERE id=?').get(saved.body.id) as any).object_id, path = join(app.recorderManagedFiles.root, 'objects', object), held = path + '.held';
    await rename(path, held); await mkdir(path);
    const failed = await api(app, h, `attachments/${saved.body.id}/delete`, { confirm: true }); assert.deepEqual(failed.json(), { deleted: false, pending: true });
    const listed = (await api(app, h, `records/${a.id}/attachments`)).json().items; assert.equal(listed[0].state, 'deleting'); assert.equal(listed[0].error, 'FILE_CLEANUP_FAILED'); assert.equal((await api(app, h, `records/${a.id}`)).json().revision, 1);
    await rmdir(path); await rename(held, path); assert.deepEqual((await api(app, h, `attachments/${saved.body.id}/delete`, { confirm: true })).json(), { deleted: true, pending: false });
    assert.deepEqual((await api(app, h, `attachments/${saved.body.id}/delete`, { confirm: true })).json(), { deleted: true, pending: false });
    const next = await upload(app, h, a.id, bytes); assert.equal(next.status, 200); const nextObject = (app.recorderDatabase.raw.prepare('SELECT object_id FROM attachments_objects WHERE id=?').get(next.body.id) as any).object_id;
    const root = app.recorderManagedFiles.root; await api(app, h, `records/${a.id}/trash`, { expectedRevision: 1 });
    await app.loader.update('attachments', { disabled: true }); await app.loader.await(); assert.equal((await api(app, h, `records/${a.id}/attachments`)).statusCode, 503);
    assert.equal((await api(app, h, 'tags')).statusCode, 200); assert.equal((await api(app, h, 'categories')).statusCode, 200); await record(app, h);
    assert.equal((await api(app, h, 'records/trash/empty', { confirm: true })).json().deleted, 1);
    assert.equal((app.recorderDatabase.raw.prepare('SELECT record_id FROM attachments_objects WHERE id=?').get(next.body.id) as any).record_id, null); assert.ok(existsSync(join(root, 'objects', nextObject)));
    await app.fiber.dispose(); app = await createApplication({ filename: f.filename, http: { port: 0 } });
    await until(() => (app.recorderDatabase.raw.prepare('SELECT state FROM attachments_objects WHERE id=?').get(next.body.id) as any).state === 'deleted'); assert.equal(existsSync(join(root, 'objects', nextObject)), false);
    assert.deepEqual(app.recorderDatabase.raw.pragma('foreign_key_check'), []);
  } finally { await app.fiber.dispose(); await f.cleanup(); }
});

test('sealed recovery sets include active/trash managed bytes without business plugins and survive live deletion; incomplete/corrupt sets fail closed', async () => {
  const f = await sample(); let app: App | undefined = await createApplication({ filename: f.filename, setupCode, http: { port: 0 } }); let maintenance: Awaited<ReturnType<typeof createMaintenance>> | undefined;
  try {
    const h = await owner(app), normal = await record(app, h), trash = await record(app, h), one = await upload(app, h, normal.id, Buffer.from('normal bytes')), two = await upload(app, h, trash.id, Buffer.from('trash bytes'));
    assert.equal(one.status, 200); assert.equal(two.status, 200); await api(app, h, `records/${trash.id}/trash`, { expectedRevision: 1 });
    const root = app.recorderManagedFiles.root; await app.loader.update('attachments', { disabled: true }); await app.loader.await(); await app.fiber.dispose(); app = undefined;
    maintenance = await createMaintenance({ filename: f.filename }); assert.equal(maintenance.get('recorderAttachments'), undefined);
    const digestPlan = maintenance.recorderMigrationPlanner.inspect().digest, objects = maintenance.recorderManagedFiles.inventory(maintenance.recorderDatabase.raw); assert.equal(objects.length, 2);
    const missing = join(root, 'objects', objects[0]!.objectId), held = missing + '.held'; await rename(missing, held);
    await assert.rejects(maintenance.recorderRecoveryPoints.create(digestPlan)); await rename(held, missing);
    assert.ok((await maintenance.recorderRecoveryPoints.list()).incomplete.length); assert.ok(existsSync(missing));
    const point = await maintenance.recorderRecoveryPoints.create(digestPlan); assert.equal(point.manifest.formatVersion, 2); assert.equal(point.manifest.objects!.length, 2);
    await maintenance.loader.update('managed-files', { disabled: true }); await maintenance.loader.await();
    await assert.rejects(maintenance.recorderRecoveryPoints.verify(point.id), { code: 'MATERIALS_UNAVAILABLE' });
    await maintenance.loader.update('managed-files', { disabled: false }); await maintenance.loader.await();
    await maintenance.fiber.dispose(); maintenance = undefined;
    app = await createApplication({ filename: f.filename, http: { port: 0 } }); assert.equal((await api(app, h, `attachments/${one.body.id}/delete`, { confirm: true })).json().deleted, true); await api(app, h, 'records/trash/empty', { confirm: true }); await app.recorderManagedFiles.cleanup(); await app.fiber.dispose(); app = undefined;
    maintenance = await createMaintenance({ filename: f.filename }); await maintenance.recorderRecoveryPoints.verify(point.id);
    const target = join(f.directory, 'restored'); const restored = await maintenance.recorderIsolatedRecovery.restore(point.id, target); assert.equal(restored.state, 'isolated'); await maintenance.recorderIsolatedRecovery.verify(target);
    const db = new Database(join(target, 'database.sqlite'), { readonly: true }); try { assert.equal((db.prepare("SELECT count(*) AS n FROM attachments_objects WHERE state='ready'").get() as any).n, 2); assert.equal((db.prepare('SELECT count(*) AS n FROM records_entries WHERE deleted_at IS NOT NULL').get() as any).n, 1); } finally { db.close(); }
    for (const object of objects) assert.equal(digest(await readFile(join(target, 'database.sqlite.files', 'objects', object.objectId))), object.digest);
    await assert.rejects(createApplication({ filename: join(target, 'database.sqlite'), http: { listen: false } }), { code: 'ISOLATED_RECOVERY' });
    const archiveFile = join(point.directory, 'objects', objects[0]!.objectId); await writeFile(archiveFile, 'corrupt'); await assert.rejects(maintenance.recorderRecoveryPoints.verify(point.id)); await assert.rejects(maintenance.recorderIsolatedRecovery.restore(point.id, join(f.directory, 'bad-restore')));
    assert.equal(existsSync(join(f.directory, 'bad-restore', 'database.sqlite')), false);
  } finally { await app?.fiber.dispose(); await maintenance?.fiber.dispose(); await f.cleanup(); }
});

test('real B004 sample upgrades only with confirmation and recovery, retains old values/SQL, and legacy database-only points remain restorable', async () => {
  const f = await sample(), raw = new Database(f.filename); const old = installedMigrations.filter(s => s.namespace !== 'attachments'); let app: App | undefined, maintenance: Awaited<ReturnType<typeof createMaintenance>> | undefined;
  try {
    raw.exec(ledgerSql);
    const baselineDigests = ['b4407f95f083733826bd9b100622547696fb812b2c41102da0e47038952a63e3', '9232a42a20abfcca4a7e9f76b196efad4e355507bba7e002077e760a9cec2145', '5cfbbbe2224e483beb33f97b020936c7f55b00a5ac0b06563f96465347287d9c', '62e93b7160c92779ff00650b929fd5b9eee4e5392ee8e100efbb4aa7c1092654', 'b364dc7ddf1361ffbce3b29568598fbcd78696c84aa4045df6618e160ea1e3af'];
    assert.deepEqual(await Promise.all(old.map(async step => digest(await readFile(new URL('../migrations/' + step.file, import.meta.url), 'utf8')))), baselineDigests, 'All five applied SQL files retain B004 bytes');
    for (const step of old) { const sql = await readFile(new URL('../migrations/' + step.file, import.meta.url), 'utf8'); raw.exec(sql.split('--> statement-breakpoint').join('\n')); raw.prepare('INSERT INTO recorder_migrations VALUES(?,?,?,?)').run(step.namespace, step.revision, digest(sql), 123); }
    const uid = randomUUID(), id = randomUUID(), trashed = randomUUID(), tag = randomUUID(), category = randomUUID();
    raw.prepare('INSERT INTO identity_users VALUES(?,?,?,?,?)').run(uid, 'legacy', 'unchanged password hash', 1, 1); raw.prepare('INSERT INTO core_instance VALUES(?,1)').run(randomUUID());
    for (const [recordId, deletedAt] of [[id, null], [trashed, 44]]) raw.prepare('INSERT INTO records_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(recordId, uid, randomUUID(), 'unchanged request hash', 'legacy title', 'legacy body', 'markdown', 1, 7, randomUUID(), 11, 22, deletedAt);
    raw.prepare('INSERT INTO tags_dictionary VALUES(?,?,?,?)').run(tag, uid, 'legacy tag', 1); raw.prepare('INSERT INTO tags_record_links VALUES(?,?)').run(id, tag);
    raw.prepare('INSERT INTO categories_nodes VALUES(?,?,?,?,?,?,?)').run(category, uid, null, 'legacy category', 3, 1, 2); raw.prepare('INSERT INTO categories_record_links VALUES(?,?)').run(trashed, category);
    const tables = ['identity_users', 'core_instance', 'identity_sessions', 'records_entries', 'tags_dictionary', 'tags_record_links', 'categories_nodes', 'categories_record_links', 'recorder_migrations'];
    const before = Object.fromEntries(tables.map(name => [name, raw.prepare('SELECT * FROM ' + name).all()])); raw.close();
    await assert.rejects(createApplication({ filename: f.filename, http: { listen: false } }), { code: 'UPGRADE_REQUIRED' });
    const inspect = await cli(f.filename, 'inspect'); assert.equal(inspect.code, 0, inspect.error); const plan = JSON.parse(inspect.output.trim()).plan; assert.deepEqual(plan.steps.map((s: any) => [s.namespace, s.revision]), [['attachments', 1]]);
    assert.equal((await cli(f.filename, 'upgrade')).code, 2); assert.equal((await cli(f.filename, 'upgrade', ['--confirm', '0'.repeat(64)])).code, 2);
    const upgraded = await cli(f.filename, 'upgrade', ['--confirm', plan.digest]); assert.equal(upgraded.code, 0, upgraded.error);
    app = await createApplication({ filename: f.filename, http: { listen: false } });
    for (const table of tables) { const query = 'SELECT * FROM ' + table + (table === 'recorder_migrations' ? " WHERE namespace <> 'attachments'" : ''); assert.deepEqual(app.recorderDatabase.raw.prepare(query).all(), before[table]); }
    for (const step of old) { const sql = await readFile(new URL('../migrations/' + step.file, import.meta.url), 'utf8'); assert.equal(digest(sql), (before.recorder_migrations as any[]).find(r => r.namespace === step.namespace && r.revision === step.revision).digest); }
    await app.fiber.dispose(); app = undefined; maintenance = await createMaintenance({ filename: f.filename });
    const point = (await maintenance.recorderRecoveryPoints.list()).valid[0]!; assert.ok(point); assert.equal(point.manifest.ledger.some(row => row.namespace === 'attachments'), false);
    // Convert this genuine pre-attachment database point to the historical v1 envelope.
    const legacy: any = { ...point.manifest, formatVersion: 1 }; delete legacy.objects; const text = JSON.stringify(legacy); await writeFile(join(point.directory, 'manifest.json'), text); await writeFile(join(point.directory, 'seal.json'), JSON.stringify({ formatVersion: 1, manifestDigest: digest(text) }));
    assert.equal((await maintenance.recorderRecoveryPoints.verify(point.id)).manifest.formatVersion, 1); const target = join(f.directory, 'legacy-restored'); await maintenance.recorderIsolatedRecovery.restore(point.id, target); await maintenance.recorderIsolatedRecovery.verify(target);
  } finally { if (raw.open) raw.close(); await app?.fiber.dispose(); await maintenance?.fiber.dispose(); await f.cleanup(); }
});
