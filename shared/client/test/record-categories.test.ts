import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { reactive, nextTick } from 'vue';
import { ApiError, type ApiTransport, type Identity, type RecordData, type CategoryData } from '@recorder/contracts';
import { PanelRegistry } from '../dist/services.js';
import { categoryPath, categoryRows } from '../dist/category-tree.js';
import * as leave from '../dist/plugins/leave-guard.js';
import * as editorPlugin from '../dist/plugins/record-editor.js';
import * as modelPlugin from '../dist/plugins/record-categories.js';
import * as panelPlugin from '../dist/plugins/categories-panel.js';
import * as recordsPanel from '../dist/plugins/records-panel.js';
import * as tagsPlugin from '../dist/plugins/record-tags.js';
import * as tagsPanel from '../dist/plugins/tags-panel.js';
const identity: Identity = { userId: 'owner', username: 'owner', sessionId: 'session', expiresAt: 9999999999999 };
const record: RecordData = { id: 'record', requestId: 'request', title: 'title', body: 'body', format: 'plain', formatVersion: 1, revision: 1, createdAt: 1, updatedAt: 1, originInstanceId: 'origin', deletedAt: null };
const root: CategoryData = { id: 'root', parentId: null, name: 'Parent', revision: 1, createdAt: 1, updatedAt: 1 };
const child: CategoryData = { ...root, id: 'child', parentId: root.id, name: 'Child' };
const tick = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)); };
function deferred() { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture() {
  const ctx = new Context(); let answer = false, prompts = 0, conflict = false, failRead = false, pending: ReturnType<typeof deferred> | undefined;
  let nodes = [{ ...root }, { ...child }]; const calls: { method: string; input: any }[] = [];
  const target = new EventTarget() as EventTarget & { confirm(): boolean }; target.confirm = () => { prompts++; return answer; };
  const accountState = reactive({ ready: true, error: '', identity: { ...identity } as Identity | undefined });
  await ctx.plugin((owner: Context) => {
    owner.provide('recorderAccount', { state: accountState, error: (e: unknown) => (e as Error).message } as any);
    owner.provide('recorderApi', { async request(method: string, input: any) {
      calls.push({ method, input: { ...input } });
      if (failRead && ['listCategories', 'getRecordCategories', 'listCategoryRecords'].includes(method)) throw new ApiError('PLUGIN_UNAVAILABLE', 'isolated read failure', 503);
      if (method === 'getRecord') return { ...record };
      if (method === 'listCategories') return pending ? pending.promise : { items: nodes.map(node => ({ ...node })) };
      if (method === 'getRecordCategories') return { items: nodes.map(node => ({ ...node })) };
      if (['listTags', 'getRecordTags'].includes(method)) return { items: [] };
      if (method === 'createCategory') { const node = { ...root, id: 'new', ...input }; nodes.push(node); return node; }
      if (method === 'updateCategory' || method === 'deleteCategory') {
        if (conflict) throw new ApiError('REVISION_CONFLICT', 'stale category, keep input', 409);
        if (method === 'deleteCategory') { nodes = []; return { deleted: 2 }; }
        const node = { ...root, ...input, revision: input.expectedRevision + 1 }; nodes = nodes.map(previous => previous.id === node.id ? node : previous); return node;
      }
      if (['addRecordCategory', 'removeRecordCategory'].includes(method)) return { ok: true };
      if (method === 'listCategoryRecords') return { items: input.offset > 0 ? [] : [record], total: 1 };
      throw new Error('Unexpected operation ' + method);
    } } as ApiTransport);
  });
  await ctx.plugin(PanelRegistry); await ctx.plugin(leave, { target }); await ctx.plugin(editorPlugin); await ctx.plugin(recordsPanel); await ctx.plugin(tagsPlugin); await ctx.plugin(tagsPanel);
  const model = await ctx.plugin(modelPlugin), panel = await ctx.plugin(panelPlugin);
  await ctx.recorderEditor.select(record.id); await tick();
  return { ctx, model, panel, calls, accountState, get prompts() { return prompts; }, answer(value: boolean) { answer = value; }, conflict(value: boolean) { conflict = value; }, failRead(value: boolean) { failRead = value; }, deferTree() { pending = deferred(); return pending; } };
}

test('category paths and tree depth distinguish same names in different parents without mutating order', () => {
  const other = { ...root, id: 'other', name: 'Other' }, duplicate = { ...child, id: 'duplicate', parentId: other.id };
  const nodes = [child, duplicate, other, root];
  assert.equal(categoryPath(nodes, child.id), 'Parent / Child'); assert.equal(categoryPath(nodes, duplicate.id), 'Other / Child');
  assert.deepEqual(categoryRows(nodes).map(row => [row.node.id, row.depth]), [['other', 0], ['duplicate', 1], ['root', 0], ['child', 1]]);
  assert.equal(nodes[0]!.id, child.id);
});
test('category writes/filtering protect record drafts; conflicts retain node name, parent and expectedRevision until explicit reload', async () => {
  const f = await fixture(), e = f.ctx.recorderEditor, model = f.ctx.recorderRecordCategories;
  try {
    model.selectNode(root.id); model.state.edit!.name = 'my node draft'; model.state.edit!.parentId = child.id; model.askDelete(root.id);
    await e.begin(); e.change({ body: 'unsaved record draft' }); await tick(); f.calls.length = 0;
    await model.add(child.id); await model.remove(child.id); await model.create('new', null); await model.saveNode(); await model.confirmDelete(); await model.filter(root.id, 'q');
    assert.equal(f.prompts, 6); assert.equal(f.calls.length, 0); assert.equal(e.state.draft.body, 'unsaved record draft');
    model.cancelDelete(); assert.equal(f.calls.length, 0);
    f.answer(true); await model.add(child.id); assert.equal(e.state.editing, false); assert.deepEqual(e.state.record, record);
    assert.equal(f.calls.some(call => call.method === 'updateRecord'), false);
    f.conflict(true); const draft = { ...model.state.edit! }; await model.saveNode(); assert.deepEqual(model.state.edit, draft); assert.match(model.state.message, /stale category/);
    await model.refresh(); assert.deepEqual(model.state.edit, draft, 'Refresh does not silently rebase a category edit');
    model.askDelete(root.id); await model.confirmDelete(); assert.equal(model.state.deleting?.revision, 1, 'Failed delete retains its original confirmation version'); model.cancelDelete();
    model.selectNode(root.id); assert.deepEqual(model.state.edit, { id: root.id, name: root.name, parentId: null, expectedRevision: 1 });
    f.conflict(false); model.state.edit!.name = 'saved name'; await model.saveNode(); assert.equal(model.state.edit!.expectedRevision, 2);
    await model.filter(root.id, 'body', 30); assert.equal(model.state.offset, 0); assert.equal(model.state.total, 1); assert.equal(model.state.resultsReady, true);
    f.failRead(true); await model.refresh(); assert.equal(model.state.treeLoaded, false); assert.equal(model.state.message, 'isolated read failure');
    f.failRead(false); await model.refresh();
    await e.select(record.id); await tick(); e.state.record = { ...record, deletedAt: 2 }; await tick(); f.calls.length = 0;
    await model.add(child.id); await model.remove(child.id); assert.equal(f.calls.length, 0);
    model.askDelete(root.id); await model.confirmDelete(); assert.equal(model.state.scopeId, ''); assert.equal(model.state.total, 0); assert.equal(model.state.edit, undefined);
  } finally { await f.ctx.fiber.dispose(); }
});
test('category provider withdrawal leaves record/tag panels available, restores data, and ignores late account responses', async () => {
  const f = await fixture();
  try {
    const previous = f.ctx.recorderRecordCategories;
    assert.deepEqual(f.ctx.recorderPanels.items.map(p => p.id), ['records', 'tags', 'categories']);
    await f.model.dispose(); await f.panel.await(); assert.deepEqual(f.ctx.recorderPanels.items.map(p => p.id), ['records', 'tags']); assert.deepEqual(previous.state.nodes, []);
    await f.ctx.recorderEditor.begin(); f.ctx.recorderEditor.change({ body: 'base editable' }); assert.equal(f.ctx.recorderEditor.dirty, true); f.answer(true); f.ctx.recorderEditor.cancel();
    await f.ctx.recorderRecordTags.refresh(); await f.ctx.plugin(modelPlugin); await f.panel.await(); await tick();
    assert.deepEqual(f.ctx.recorderRecordCategories.state.nodes, [root, child]); assert.equal(f.ctx.recorderPanels.items.length, 3);
    const late = f.deferTree(); const loading = f.ctx.recorderRecordCategories.refresh(); await tick();
    f.accountState.identity = undefined; const atLogout = f.calls.length; late.resolve({ items: [{ ...root, name: 'old secret' }] }); await loading; await tick();
    assert.deepEqual(f.ctx.recorderRecordCategories.state.nodes, []); assert.deepEqual(f.ctx.recorderRecordCategories.state.links, []); assert.equal(f.calls.length, atLogout, 'An old tree response cannot start follow-up requests in a new session');
  } finally { await f.ctx.fiber.dispose(); }
});
