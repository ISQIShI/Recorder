import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { reactive, nextTick } from 'vue';
import { ApiError, type FileDeviceBridge, type Identity, type RecordData, type FileRecordData } from '@recorder/contracts';
import { PanelRegistry } from '../dist/services.js';
import * as leave from '../dist/plugins/leave-guard.js';
import * as editor from '../dist/plugins/record-editor.js';
import * as transfer from '../dist/plugins/file-transfer.js';
import * as files from '../dist/plugins/file-records.js';
import * as panel from '../dist/plugins/file-records-panel.js';
const record: RecordData = { id: 'record', requestId: 'request', title: 'file.txt', body: '', format: 'plain', formatVersion: 1, revision: 1, createdAt: 1, updatedAt: 1, originInstanceId: 'origin', deletedAt: null };
const result: FileRecordData = { record, attachment: { id: 'attachment', name: 'file.txt', mediaType: 'application/octet-stream', bytes: 4, digest: 'a'.repeat(64), createdAt: 1, state: 'ready', error: null } };
const tick = async () => { await nextTick(); await new Promise(r => setImmediate(r)); };
async function fixture(available = true) {
  const ctx = new Context(), calls: { method: string; input: any }[] = [];
  const account = reactive({ identity: { sessionId: 'first' } as Identity | undefined });
  let answer = false, fail = true, resolve: ((value: unknown) => void) | undefined, pending: Promise<any> | undefined, stale = false;
  const bridge: FileDeviceBridge = { onProgress() { return () => {}; }, async invoke(method, input) {
    calls.push({ method, input });
    if (method === 'choose') return { ok: true, value: { handle: 'grant', name: 'file.txt', bytes: 4 } };
    if (method === 'createRecord') return pending ?? (fail ? { ok: false, error: { code: 'CONNECTION_FAILED', message: 'uncertain', status: 503 } } : { ok: true, value: result });
    return { ok: true, value: true };
  } };
  await ctx.plugin((owner: Context) => {
    owner.provide('recorderAccount', { state: account, error: (error: Error) => error.message } as any);
    owner.provide('recorderApi', { async request(method: string, input: any) { calls.push({ method, input }); if (method === 'getRecord') return { ...record, revision: stale ? 3 : 1 }; if (method === 'updateRecord') { if (stale) throw new ApiError('REVISION_CONFLICT', 'conflict', 409); return { ...record, ...input, revision: 2 }; } throw new Error(method); } } as any);
  });
  await ctx.plugin(PanelRegistry); const target = new EventTarget() as EventTarget & { confirm(): boolean }; target.confirm = () => answer;
  await ctx.plugin(leave, { target }); await ctx.plugin(editor); await ctx.plugin(transfer, { bridge: available ? bridge : undefined });
  const provider = await ctx.plugin(files), contribution = await ctx.plugin(panel);
  return { ctx, calls, account, provider, contribution, answer(v: boolean) { answer = v; }, succeed() { fail = false; }, conflict() { stale = true; }, defer() { pending = new Promise(r => { resolve = r; }); return (value: unknown) => resolve!(value); } };
}
test('file creation protects drafts, retries the same upload and selects confirmed empty record; empty-body conflict keeps original draft/revision', async () => {
  const f = await fixture(), model = f.ctx.recorderFileRecords, e = f.ctx.recorderEditor;
  try {
    await e.select(record.id); await e.begin(); e.change({ title: 'unsaved title' }); f.calls.length = 0;
    await model.choose(); assert.equal(f.calls.length, 0); assert.equal(e.state.draft.body, ''); assert.equal(e.state.draft.title, 'unsaved title');
    f.answer(true); await model.choose(); const id = model.state.uploadId; assert.ok(id); assert.equal(e.state.editing, false);
    await model.create(); assert.match(model.state.message, /uncertain/); assert.equal(model.state.uploadId, id); assert.equal(model.state.chosen?.handle, 'grant');
    f.succeed(); await model.create(); assert.deepEqual(f.calls.filter(c => c.method === 'createRecord').map(c => c.input.uploadId), [id, id]); assert.equal(model.state.chosen, undefined); assert.equal(e.state.record?.body, ''); assert.match(model.state.message, /首个附件已保存/);
    await e.begin(); e.change({ title: '' }); assert.ok(e.dirty); const saved = await e.save(); assert.equal(saved?.body, ''); assert.equal(saved?.title, '');
    e.change({ title: 'conflict draft' }); const baseline = e.state.baseline?.revision; f.conflict(); await e.save(); assert.equal(e.state.conflict, true); assert.equal(e.state.draft.title, 'conflict draft'); assert.equal(e.state.draft.body, ''); assert.equal(e.state.baseline?.revision, baseline);
    await e.viewLatest(); assert.equal(e.state.draft.body, ''); assert.equal(e.state.baseline?.revision, baseline); assert.equal(e.state.latest?.revision, 3);
  } finally { await f.ctx.fiber.dispose(); }
});
test('session replacement and provider withdrawal cancel file creation and ignore late replies; unavailable device has no side effects', async () => {
  const f = await fixture(), m = f.ctx.recorderFileRecords;
  try {
    await m.choose(); const finish = f.defer(), creating = m.create(); await tick(); assert.equal(f.ctx.recorderLeave.dirty, true);
    f.account.identity = undefined; await tick(); assert.equal(m.state.chosen, undefined); assert.equal(m.state.busy, false); assert.ok(f.calls.some(c => c.method === 'cancel'));
    finish({ ok: true, value: result }); await creating; assert.equal(m.state.created, undefined); assert.equal(f.ctx.recorderEditor.state.record, undefined); assert.equal(m.state.message, '');
    f.account.identity = { sessionId: 'second' } as Identity; await m.choose(); const finishWithdrawn = f.defer(), withdrawn = m.create(); await tick();
    await f.provider.dispose(); await f.contribution.await(); finishWithdrawn({ ok: true, value: result }); await withdrawn; assert.deepEqual(f.ctx.recorderPanels.items, []); assert.equal(f.ctx.recorderEditor.state.record, undefined);
  } finally { await f.ctx.fiber.dispose(); }
  const absent = await fixture(false);
  try { await absent.ctx.recorderFileRecords.choose(); assert.equal(absent.calls.length, 0); assert.equal(absent.ctx.recorderFileTransfer.available, false); }
  finally { await absent.ctx.fiber.dispose(); }
});
