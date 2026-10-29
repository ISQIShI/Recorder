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
import type { RecordData, CategoryData, TagData } from '@recorder/contracts';
type App = Awaited<ReturnType<typeof createApplication>>;
const setupCode = 'isolated-categories-setup-code', native = { 'x-recorder-client': 'native', 'x-recorder-request': '1' };
async function sample() {
  const directory = await mkdtemp(join(tmpdir(), 'recorder-categories-'));
  return { filename: join(directory, 'data.sqlite'), async cleanup() {
    const path = resolve(directory); assert.equal(dirname(path), resolve(tmpdir())); assert.ok(basename(path).startsWith('recorder-categories-'));
    await rm(path, { recursive: true, force: true });
  } };
}
function api(ctx: App, headers: Record<string, string>, path: string, payload?: object, method?: 'PUT') {
  return ctx.recorderHttp.server.inject({ method: method ?? (payload ? 'POST' : 'GET'), url: '/api/v1/' + path, headers, ...(payload ? { payload } : {}) });
}
async function owner(ctx: App) {
  const r = await api(ctx, native, 'auth/setup', { username: 'owner', password: 'correct horse battery staple', remember: true, clientName: 'Category test', setupCode });
  assert.equal(r.statusCode, 200, r.body); return { ...native, authorization: 'Bearer ' + r.headers['x-recorder-session'] };
}
const recordInput = () => ({ requestId: randomUUID(), title: 'Category needle', body: '# source <script>literal</script>', format: 'markdown' as const });
async function cli(filename: string, command: string, args: string[] = []) {
  const child = spawn(process.execPath, ['backend/dist/maintenance-cli.js', command, '--database', filename, ...args], { cwd: new URL('../../', import.meta.url), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = ''; child.stdout.on('data', v => { output += v; }); child.stderr.on('data', v => { error += v; });
  return new Promise<{ code: number | null; output: string; error: string }>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('CLI timeout: ' + error)); }, 60000);
    child.on('error', e => { clearTimeout(timeout); reject(e); }); child.on('exit', code => { clearTimeout(timeout); resolve({ code, output, error }); });
  });
}

test('category trees enforce names/revisions/cycles, deduplicate descendants, persist and delete only intended nodes and links transactionally', async () => {
  const f = await sample(); let ctx = await createApplication({ filename: f.filename, setupCode, http: { listen: false } });
  try {
    const h = await owner(ctx);
    const create = async (name: string, parentId: string | null = null) => { const r = await api(ctx, h, 'categories', { name, parentId }); assert.equal(r.statusCode, 200, r.body); return r.json<CategoryData>(); };
    const update = (node: CategoryData, name: string, parentId: string | null) => api(ctx, h, 'categories/' + node.id, { name, parentId, expectedRevision: node.revision }, 'PUT');
    const root = await create('  Root  '), outer = await create('Outside'), child = await create('Same', root.id), grand = await create('Grandchild', child.id);
    const outsideChild = await create('Same', outer.id); assert.equal(root.name, 'Root');
    for (const [name, parentId] of [[' Root ', null], [' Same ', root.id]] as const) assert.equal((await api(ctx, h, 'categories', { name, parentId })).json().code, 'CATEGORY_NAME_CONFLICT');
    // SQLite's NULL handling must not bypass the top-level uniqueness constraint.
    const ownerId = (ctx.recorderDatabase.raw.prepare('SELECT id FROM identity_users').get() as { id: string }).id;
    assert.throws(() => ctx.recorderDatabase.raw.prepare('INSERT INTO categories_nodes VALUES(?,?,?,?,?,?,?)').run(randomUUID(), ownerId, null, 'Root', 1, 1, 1), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    assert.equal((await update(root, root.name, grand.id)).json().code, 'CATEGORY_CYCLE');
    assert.equal((await update(root, root.name, root.id)).json().code, 'CATEGORY_CYCLE');
    assert.equal((await update(child, child.name, outer.id)).json().code, 'CATEGORY_NAME_CONFLICT');
    const renamed = (await update(child, 'Renamed', root.id)).json<CategoryData>(); assert.equal(renamed.revision, 2);
    assert.equal((await update(child, 'stale input', null)).json().code, 'REVISION_CONFLICT');
    const moved = (await update(renamed, renamed.name, outer.id)).json<CategoryData>(); assert.equal(moved.revision, 3); assert.equal(moved.parentId, outer.id);
    const back = (await update(moved, moved.name, root.id)).json<CategoryData>(); assert.equal(back.revision, 4);
    assert.equal((await api(ctx, h, 'categories')).json().items.find((n: CategoryData) => n.id === grand.id).parentId, child.id);
    const records: RecordData[] = [];
    for (let i = 0; i < 3; i++) records.push((await api(ctx, h, 'records', recordInput())).json<RecordData>());
    const tag = (await api(ctx, h, 'tags', { name: 'preserved tag' })).json<TagData>();
    const add = (id: string, categoryId: string) => api(ctx, h, `records/${id}/categories/add`, { categoryId });
    for (const node of [root, child, grand, outer, child]) assert.equal((await add(records[0]!.id, node.id)).statusCode, 200);
    await add(records[1]!.id, child.id); await add(records[2]!.id, grand.id); await add(records[2]!.id, outer.id);
    for (const record of [records[0]!, records[2]!]) await api(ctx, h, `records/${record.id}/tags/add`, { tagId: tag.id });
    for (let i = 0; i < 2; i++) assert.equal((await api(ctx, h, `records/${records[0]!.id}/categories/remove`, { categoryId: grand.id })).statusCode, 200);
    await add(records[0]!.id, grand.id);
    assert.deepEqual((await api(ctx, h, 'records/' + records[0]!.id)).json(), records[0], 'Membership never changes record revision, updatedAt or content');
    await api(ctx, h, `records/${records[2]!.id}/trash`, { expectedRevision: 1 });
    const page = (offset: number) => api(ctx, h, `categories/${root.id}/records?q=NEEDLE&limit=1&offset=${offset}`);
    const a = (await page(0)).json(), b = (await page(1)).json();
    assert.equal(a.total, 2); assert.equal(b.total, 2); assert.equal(a.items.length, 1); assert.equal(b.items.length, 1); assert.notEqual(a.items[0].id, b.items[0].id);
    assert.equal((await page(2)).json().items.length, 0); assert.equal((await api(ctx, h, `categories/${root.id}/records?q=%25`)).json().total, 0);
    const trashed = (await api(ctx, h, `records/${records[0]!.id}/trash`, { expectedRevision: 1 })).json<RecordData>();
    const memberships = (await api(ctx, h, `records/${trashed.id}/categories`)).json().items;
    assert.equal(memberships.length, 4);
    for (const action of ['add', 'remove']) assert.equal((await api(ctx, h, `records/${trashed.id}/categories/${action}`, { categoryId: outer.id })).json().code, 'RECORD_TRASHED');
    assert.equal((await page(0)).json().total, 1);
    const nodes = (await api(ctx, h, 'categories')).json();
    await ctx.fiber.dispose(); ctx = await createApplication({ filename: f.filename, http: { listen: false } });
    assert.deepEqual((await api(ctx, h, 'categories')).json(), nodes); assert.deepEqual((await api(ctx, h, `records/${trashed.id}/categories`)).json().items, memberships);
    const restored = (await api(ctx, h, `records/${trashed.id}/restore`, { expectedRevision: 2 })).json<RecordData>();
    assert.equal((await page(0)).json().total, 2);
    await create('Added after confirmation was opened', child.id); // Root revision is unchanged; deletion includes these current descendants.
    const beforeRecords = ctx.recorderDatabase.raw.prepare('SELECT * FROM records_entries ORDER BY id').all();
    const beforeTags = ctx.recorderDatabase.raw.prepare('SELECT * FROM tags_record_links ORDER BY record_id').all();
    const beforeLinks = ctx.recorderDatabase.raw.prepare('SELECT * FROM categories_record_links ORDER BY record_id,category_id').all();
    const removeTree = (expectedRevision: number, confirm = true) => api(ctx, h, `categories/${root.id}/delete`, { expectedRevision, confirm });
    assert.equal((await removeTree(1, false)).statusCode, 400); assert.equal((await removeTree(2)).json().code, 'REVISION_CONFLICT');
    ctx.recorderDatabase.raw.exec("CREATE TRIGGER isolated_category_rollback BEFORE DELETE ON categories_record_links BEGIN SELECT RAISE(ABORT, 'isolated rollback'); END");
    assert.equal((await removeTree(1)).statusCode, 500);
    assert.equal((await api(ctx, h, 'categories')).json().items.length, 6);
    assert.deepEqual(ctx.recorderDatabase.raw.prepare('SELECT * FROM categories_record_links ORDER BY record_id,category_id').all(), beforeLinks);
    ctx.recorderDatabase.raw.exec('DROP TRIGGER isolated_category_rollback');
    assert.deepEqual((await removeTree(1)).json(), { deleted: 4 });
    assert.deepEqual(ctx.recorderDatabase.raw.prepare('SELECT * FROM records_entries ORDER BY id').all(), beforeRecords);
    assert.deepEqual(ctx.recorderDatabase.raw.prepare('SELECT * FROM tags_record_links ORDER BY record_id').all(), beforeTags);
    assert.deepEqual((await api(ctx, h, `records/${restored.id}/categories`)).json().items, [outer]);
    assert.equal((await api(ctx, h, 'categories')).json().items.length, 2); assert.equal((await api(ctx, h, `categories/${root.id}/records`)).statusCode, 404);
    await api(ctx, h, `records/${records[2]!.id}/restore`, { expectedRevision: 2 });
    assert.deepEqual((await api(ctx, h, `records/${records[2]!.id}/categories`)).json().items, [outer], 'Restoring a record cannot recreate deleted categories');
    await api(ctx, h, `records/${restored.id}/trash`, { expectedRevision: 3 });
    await ctx.loader.update('category-store', { disabled: true }); await ctx.loader.await();
    assert.equal((await api(ctx, h, 'categories')).statusCode, 503); assert.equal((await api(ctx, h, 'tags')).statusCode, 200);
    assert.equal((await api(ctx, h, 'records/trash/empty', { confirm: true })).json().deleted, 1);
    assert.deepEqual(ctx.recorderDatabase.raw.prepare('SELECT * FROM categories_record_links WHERE record_id=?').all(restored.id), []);
    const edited = await api(ctx, h, 'records/' + records[1]!.id, { expectedRevision: 1, title: 'base editable', body: 'still works', format: 'plain' }, 'PUT'); assert.equal(edited.statusCode, 200);
    await api(ctx, h, `records/${records[1]!.id}/trash`, { expectedRevision: 2 }); assert.equal((await api(ctx, h, `records/${records[1]!.id}/restore`, { expectedRevision: 3 })).statusCode, 200);
    await ctx.loader.update('category-store', { disabled: false }); await ctx.loader.await();
    assert.deepEqual((await api(ctx, h, 'categories')).json().items.map((n: CategoryData) => n.id).sort(), [outer.id, outsideChild.id].sort());
    assert.deepEqual((await api(ctx, h, `records/${records[2]!.id}/tags`)).json().items, [tag]);
    assert.deepEqual(ctx.recorderDatabase.raw.pragma('foreign_key_check'), []);
  } finally { await ctx.fiber.dispose(); await f.cleanup(); }
});

test('category APIs enforce owner isolation, strict inputs, CSRF, node conflicts and OpenAPI', async () => {
  const ctx = await createApplication({ filename: ':memory:', setupCode, http: { listen: false } });
  try {
    const h = await owner(ctx), otherId = randomUUID(), token = ctx.recorderCrypto.token();
    ctx.recorderDatabase.raw.prepare('INSERT INTO identity_users VALUES(?,?,?,?,?)').run(otherId, 'other', 'sample-hash', 2, 1);
    ctx.recorderIdentityStore.createSession({ id: randomUUID(), userId: otherId, tokenHash: ctx.recorderCrypto.digest(token), channel: 'native', clientName: 'other', createdAt: 1, expiresAt: Date.now() + 60000 });
    const other = { ...native, authorization: 'Bearer ' + token };
    const category = (await api(ctx, h, 'categories', { name: 'same', parentId: null })).json<CategoryData>();
    const otherCategory = (await api(ctx, other, 'categories', { name: 'same', parentId: null })).json<CategoryData>(); assert.notEqual(category.id, otherCategory.id);
    const record = (await api(ctx, h, 'records', recordInput())).json<RecordData>();
    for (const action of ['add', 'remove']) {
      assert.equal((await api(ctx, other, `records/${record.id}/categories/${action}`, { categoryId: otherCategory.id })).statusCode, 404);
      assert.equal((await api(ctx, h, `records/${record.id}/categories/${action}`, { categoryId: otherCategory.id })).statusCode, 404);
      assert.equal((await api(ctx, native, `records/${record.id}/categories/${action}`, { categoryId: category.id })).statusCode, 401);
    }
    assert.equal((await api(ctx, other, `records/${record.id}/categories`)).statusCode, 404);
    assert.equal((await api(ctx, other, `categories/${category.id}/records`)).statusCode, 404);
    assert.equal((await api(ctx, other, 'categories/' + category.id, { name: 'no', parentId: null, expectedRevision: 1 }, 'PUT')).statusCode, 404);
    assert.equal((await api(ctx, other, `categories/${category.id}/delete`, { expectedRevision: 1, confirm: true })).statusCode, 404);
    assert.equal((await api(ctx, h, 'categories', { name: 'no', parentId: otherCategory.id })).statusCode, 404);
    assert.equal((await api(ctx, h, 'categories/' + category.id, { name: 'no', parentId: otherCategory.id, expectedRevision: 1 }, 'PUT')).statusCode, 404);
    assert.deepEqual((await api(ctx, other, 'categories')).json().items, [otherCategory]);
    for (const name of ['', ' ', 'x'.repeat(65), '😀'.repeat(33), 12, null, true]) assert.equal((await api(ctx, h, 'categories', { name, parentId: null })).statusCode, 400);
    assert.equal((await api(ctx, h, 'categories', { name: '  ' + '😀'.repeat(32) + '  ', parentId: null })).statusCode, 200);
    for (const payload of [{ name: 'n' }, { name: 'n', parentId: false }, { name: 'n', parentId: '' }, { name: 'n', parentId: null, ownerId: otherId }]) assert.equal((await api(ctx, h, 'categories', payload)).statusCode, 400);
    for (const expectedRevision of ['1', true, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await api(ctx, h, 'categories/' + category.id, { name: 'n', parentId: null, expectedRevision }, 'PUT')).statusCode, 400);
      assert.equal((await api(ctx, h, `categories/${category.id}/delete`, { expectedRevision, confirm: true })).statusCode, 400);
    }
    assert.equal((await api(ctx, h, `categories/${category.id}/delete`, { expectedRevision: 1, confirm: 'true' })).statusCode, 400);
    for (const query of ['limit=0', 'limit=101', 'offset=-1', 'state=trash']) assert.equal((await api(ctx, h, `categories/${category.id}/records?${query}`)).statusCode, 400);
    const wh = { origin: 'http://127.0.0.1:5173', 'x-recorder-request': '1' };
    const login = await api(ctx, wh, 'auth/login', { username: 'owner', password: 'correct horse battery staple', remember: false, clientName: 'web' });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    assert.equal((await api(ctx, { ...wh, cookie }, 'categories', { name: 'csrf', parentId: null })).statusCode, 403);
    assert.equal((await api(ctx, { ...wh, cookie, 'x-csrf-token': String(login.headers['x-csrf-token']) }, 'categories', { name: 'csrf', parentId: null })).statusCode, 200);
    const spec = (await ctx.recorderHttp.server.inject({ url: '/openapi.json' })).json();
    const put = spec.paths['/api/v1/categories/{id}'].put; assert.equal(put.operationId, 'updateCategory'); assert.ok(put.responses['409']);
    assert.deepEqual(put.requestBody.content['application/json'].schema.required, ['name', 'parentId', 'expectedRevision']);
    assert.equal(spec.paths['/api/v1/categories/{id}/delete'].post.requestBody.content['application/json'].schema.properties.confirm.const, true);
  } finally { await ctx.fiber.dispose(); }
});

test('real B003 database requires confirmed CLI upgrade and recovery point, preserving identity, records, trash and tag data byte-for-byte', async () => {
  const f = await sample(), raw = new Database(f.filename), ownerId = randomUUID(), tagId = randomUUID();
  const before = new Map<string, unknown[]>();
  try {
    raw.exec(ledgerSql);
    const digests = ['b4407f95f083733826bd9b100622547696fb812b2c41102da0e47038952a63e3', '9232a42a20abfcca4a7e9f76b196efad4e355507bba7e002077e760a9cec2145', '5cfbbbe2224e483beb33f97b020936c7f55b00a5ac0b06563f96465347287d9c', '62e93b7160c92779ff00650b929fd5b9eee4e5392ee8e100efbb4aa7c1092654'];
    for (const [i, step] of installedMigrations.filter(s => !['attachments', 'categories'].includes(s.namespace)).entries()) {
      const text = await readFile(new URL('../migrations/' + step.file, import.meta.url), 'utf8'), digest = createHash('sha256').update(text).digest('hex');
      assert.equal(digest, digests[i], 'Already applied identity/records/tags SQL bytes remain unchanged'); raw.exec(text.split('--> statement-breakpoint').join('\n'));
      raw.prepare('INSERT INTO recorder_migrations VALUES(?,?,?,?)').run(step.namespace, step.revision, digest, 123);
    }
    raw.prepare('INSERT INTO core_instance VALUES(?,1)').run(randomUUID()); raw.prepare('INSERT INTO identity_users VALUES(?,?,?,?,?)').run(ownerId, 'legacy', 'sample-hash', 1, 1);
    raw.prepare('INSERT INTO identity_sessions VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), ownerId, 'old-token-hash', 'native', 'old client', 1, 9999999999999, null);
    raw.prepare('INSERT INTO tags_dictionary VALUES(?,?,?,?)').run(tagId, ownerId, 'old tag', 1);
    for (const deletedAt of [null, 456]) {
      const id = randomUUID(); raw.prepare('INSERT INTO records_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, ownerId, randomUUID(), 'old-request-hash', 'old title', '# old body', 'markdown', 1, 7, 'old-origin', 12, 13, deletedAt);
      raw.prepare('INSERT INTO tags_record_links VALUES(?,?)').run(id, tagId);
    }
    for (const table of ['core_instance', 'identity_users', 'identity_sessions', 'records_entries', 'tags_dictionary', 'tags_record_links', 'recorder_migrations']) before.set(table, raw.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all());
  } finally { raw.close(); }
  let app: App | undefined;
  try {
    await assert.rejects(createApplication({ filename: f.filename, http: { listen: false } }), { code: 'UPGRADE_REQUIRED' });
    const inspect = await cli(f.filename, 'inspect'); assert.equal(inspect.code, 0, inspect.error);
    const plan = JSON.parse(inspect.output.trim()).plan; assert.deepEqual(plan.steps.map((s: any) => [s.namespace, s.revision]), [['attachments', 1], ['categories', 1]]);
    assert.equal((await cli(f.filename, 'upgrade')).code, 2); assert.equal((await cli(f.filename, 'upgrade', ['--confirm', '0'.repeat(64)])).code, 2);
    const upgraded = await cli(f.filename, 'upgrade', ['--confirm', plan.digest]); assert.equal(upgraded.code, 0, upgraded.error);
    const points = await cli(f.filename, 'points'); assert.equal(points.code, 0, points.error);
    const point = JSON.parse(points.output.trim()).valid[0]; assert.equal(point.manifest.ledger.length, 4); assert.equal(point.manifest.plan.digest, plan.digest);
    app = await createApplication({ filename: f.filename, http: { listen: false } });
    for (const [table, data] of before) assert.deepEqual(app.recorderDatabase.raw.prepare('SELECT * FROM ' + table + (table === 'recorder_migrations' ? " WHERE namespace NOT IN ('attachments','categories')" : '') + ' ORDER BY 1').all(), data, table);
    assert.deepEqual(app.recorderCategoryStore.list(ownerId), []); assert.equal(app.recorderRecordStore.list(ownerId, '', 30, 0, 'trash').total, 1);
    assert.equal(app.recorderTagStore.list(ownerId).length, 1); assert.deepEqual(app.recorderDatabase.raw.pragma('foreign_key_check'), []); assert.equal(app.recorderDatabase.raw.pragma('integrity_check', { simple: true }), 'ok');
  } finally { await app?.fiber.dispose(); await f.cleanup(); }
});
