import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { reactive, nextTick } from 'vue';
import { ApiError, type ApiTransport, type Identity, type RecordData } from '@recorder/contracts';
import { PanelRegistry } from '../dist/services.js';
import * as leave from '../dist/plugins/leave-guard.js';
import * as editorPlugin from '../dist/plugins/record-editor.js';
import * as tagsPlugin from '../dist/plugins/record-tags.js';
import * as tagsPanel from '../dist/plugins/tags-panel.js';
import * as recordsPanel from '../dist/plugins/records-panel.js';
const identity: Identity = { userId: 'owner', username: 'owner', sessionId: 'session', expiresAt: 9999999999999 };
const record: RecordData = { id: 'record', requestId: 'request', title: 'title', body: 'body', format: 'plain', formatVersion: 1, revision: 1, createdAt: 1, updatedAt: 1, originInstanceId: 'origin', deletedAt: null };
const tag = { id: 'tag', name: 'tag name', createdAt: 1 };
const tick = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)); };
function deferred() { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture() {
  const ctx = new Context(); let answer = false, prompts = 0, failure = false, readFailure = false, selected: ReturnType<typeof deferred> | undefined;
  const target = new EventTarget() as EventTarget & { confirm(): boolean }; target.confirm = () => { prompts++; return answer; };
  const accountState = reactive({ ready: true, error: '', identity: { ...identity } as Identity | undefined });
  const calls: { method: string; input: any }[] = [];
  await ctx.plugin((owner: Context) => {
    owner.provide('recorderAccount', { state: accountState, error: (e: unknown) => (e as Error).message } as any);
    owner.provide('recorderApi', { async request(method: string, input: any) {
      calls.push({ method, input });
      if (readFailure && ['getRecordTags', 'listTagRecords'].includes(method)) throw new ApiError('PLUGIN_UNAVAILABLE', 'isolated read failure', 503);
      if (method === 'getRecord') return { ...record };
      if (method === 'getRecordTags') return selected ? selected.promise : { items: [tag] };
      if (method === 'listTags') return { items: [tag] };
      if (method === 'createTag') return tag;
      if (['addRecordTag', 'removeRecordTag'].includes(method)) {
        if (failure) throw new ApiError('RECORD_TRASHED', 'read-only trash', 409);
        return { ok: true };
      }
      if (method === 'listTagRecords') return { items: input.offset > 0 ? [] : [record], total: 1 };
      throw new Error('Unexpected operation ' + method);
    } } as ApiTransport);
  });
  await ctx.plugin(PanelRegistry); await ctx.plugin(leave, { target }); await ctx.plugin(editorPlugin); await ctx.plugin(recordsPanel);
  const model = await ctx.plugin(tagsPlugin), panel = await ctx.plugin(tagsPanel);
  await ctx.recorderEditor.select(record.id); await tick();
  return { ctx, model, panel, calls, accountState, get prompts() { return prompts; }, answer(value: boolean) { answer = value; }, fail(value: boolean) { failure = value; }, failRead(value: boolean) { readFailure = value; }, deferTags() { selected = deferred(); return selected; } };
}
test('tag writes and filtering protect dirty drafts before ending edit, keep record revision, and report partial create failures', async () => {
  const f = await fixture(), e = f.ctx.recorderEditor, model = f.ctx.recorderRecordTags;
  try {
    await e.begin(); e.change({ body: 'unsaved draft' }); await tick(); f.calls.length = 0;
    await model.add(tag.id); await model.remove(tag.id); await model.create('tag'); await model.filter(tag.id, 'q');
    assert.equal(f.prompts, 4); assert.equal(f.calls.length, 0); assert.equal(e.state.draft.body, 'unsaved draft'); assert.equal(e.state.editing, true);
    f.answer(true); await model.add(tag.id);
    assert.equal(e.state.editing, false); assert.deepEqual(e.state.record, record);
    assert.ok(f.calls.some(c => c.method === 'addRecordTag' && c.input.id === record.id)); assert.equal(f.calls.some(c => c.method === 'updateRecord'), false);
    f.fail(true); await model.create('tag'); assert.match(model.state.message, /标签已创建或复用，但添加关联失败/); assert.deepEqual(model.state.dictionary, [tag]);
    assert.deepEqual(e.state.record, record);
    await model.filter(tag.id, 'body', 30); assert.equal(model.state.offset, 0); assert.equal(model.state.total, 1); assert.equal(model.state.items[0]!.id, record.id);
    f.failRead(true); await model.refresh();
    assert.equal(model.state.tagsLoaded, false); assert.equal(model.state.resultsReady, false); assert.equal(model.state.message, 'isolated read failure');
    f.failRead(false); await model.refresh(); assert.equal(model.state.resultsReady, true);
    await e.select(record.id); await tick(); e.state.record = { ...record, deletedAt: 2 }; await tick(); f.calls.length = 0;
    await model.add(tag.id); await model.remove(tag.id); await model.create('tag'); assert.equal(f.calls.length, 0, 'Trash remains read-only locally too');
  } finally { await f.ctx.fiber.dispose(); }
});
test('withdrawing tags removes only its UI, reactivation restores persisted tags, and late account responses cannot leak', async () => {
  const f = await fixture();
  try {
    const previous = f.ctx.recorderRecordTags;
    assert.deepEqual(f.ctx.recorderPanels.items.map(p => p.id), ['records', 'tags']);
    await f.model.dispose(); await f.panel.await();
    assert.deepEqual(f.ctx.recorderPanels.items.map(p => p.id), ['records']);
    assert.equal(previous.state.tags.length, 0);
    await f.ctx.recorderEditor.begin(); f.ctx.recorderEditor.change({ body: 'base still editable' }); assert.equal(f.ctx.recorderEditor.dirty, true);
    f.answer(true); f.ctx.recorderEditor.cancel();
    await f.ctx.plugin(tagsPlugin); await f.panel.await(); await tick();
    assert.deepEqual(f.ctx.recorderPanels.items.map(p => p.id), ['records', 'tags']); assert.deepEqual(f.ctx.recorderRecordTags.state.tags, [tag]);
    const late = f.deferTags(); const loading = f.ctx.recorderRecordTags.refresh(); await tick();
    f.accountState.identity = undefined; late.resolve({ items: [{ ...tag, name: 'old secret' }] }); await loading; await tick();
    assert.deepEqual(f.ctx.recorderRecordTags.state.tags, []); assert.deepEqual(f.ctx.recorderRecordTags.state.dictionary, []); assert.deepEqual(f.ctx.recorderRecordTags.state.items, []);
  } finally { await f.ctx.fiber.dispose(); }
});
