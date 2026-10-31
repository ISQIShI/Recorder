import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { reactive, nextTick } from 'vue';
import type { AttachmentData, FileDeviceBridge, FileProgress, Identity, RecordData } from '@recorder/contracts';
import { PanelRegistry } from '../dist/services.js';
import * as leave from '../dist/plugins/leave-guard.js';
import * as editor from '../dist/plugins/record-editor.js';
import * as files from '../dist/plugins/file-transfer.js';
import * as attachments from '../dist/plugins/record-attachments.js';
import * as panel from '../dist/plugins/attachments-panel.js';
const record: RecordData = { id: 'record', requestId: 'request', title: 'title', body: 'body', format: 'plain', formatVersion: 1, revision: 1, createdAt: 1, updatedAt: 1, originInstanceId: 'origin', deletedAt: null };
const item: AttachmentData = { id: 'attachment', name: 'sample.bin', mediaType: 'application/octet-stream', bytes: 4, digest: 'a'.repeat(64), createdAt: 1, state: 'ready', error: null };
const tick = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)); };
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(available = true) {
  const ctx = new Context(), calls: { method: string; input: any }[] = [];
  const state = reactive({ identity: { sessionId: 'session' } as Identity | undefined });
  let answer = false, failUpload = true, progress: ((p: FileProgress) => void) | undefined, pending: ReturnType<typeof deferred> | undefined;
  const bridge: FileDeviceBridge = {
    onProgress(callback) { progress = callback; return () => { progress = undefined; }; },
    async invoke(method, input: any) {
      calls.push({ method, input });
      if (method === 'choose') return { ok: true, value: { handle: 'grant', name: item.name, bytes: item.bytes } };
      if (method === 'upload') {
        progress?.({ id: input.transferId, phase: 'upload', bytes: 4, total: 4 });
        if (pending) return pending.promise;
        return failUpload ? { ok: false, error: { code: 'CONNECTION_FAILED', message: 'Upload result uncertain', status: 503 } } : { ok: true, value: item };
      }
      return { ok: true, value: true };
    },
  };
  await ctx.plugin((owner: Context) => {
    owner.provide('recorderAccount', { state, error: (e: Error) => e.message } as any);
    owner.provide('recorderApi', { async request(method: string, input: any) {
      calls.push({ method, input });
      if (method === 'getRecord') return { ...record };
      if (method === 'listAttachments') return { items: [item] };
      if (method === 'deleteAttachment') return { deleted: false, pending: true };
      throw new Error(method);
    } } as any);
  });
  await ctx.plugin(PanelRegistry);
  const target = new EventTarget() as EventTarget & { confirm(): boolean }; target.confirm = () => answer;
  await ctx.plugin(leave, { target }); await ctx.plugin(editor); await ctx.plugin(files, { bridge: available ? bridge : undefined });
  const provider = await ctx.plugin(attachments), contribution = await ctx.plugin(panel);
  await ctx.recorderEditor.select(record.id); await tick(); calls.length = 0;
  return { ctx, state, calls, provider, contribution, answer(value: boolean) { answer = value; }, succeed() { failUpload = false; }, defer() { pending = deferred(); return pending; }, get subscribed() { return !!progress; } };
}
test('attachment operations protect drafts, preserve upload identity for uncertain retries, and expose durable delete pending', async () => {
  const f = await fixture(), m = f.ctx.recorderRecordAttachments, e = f.ctx.recorderEditor;
  try {
    await e.begin(); e.change({ body: 'unsaved' }); f.calls.length = 0;
    await m.choose(); assert.equal(f.calls.length, 0); assert.equal(e.state.draft.body, 'unsaved');
    f.answer(true); await m.choose(); const uploadId = m.state.uploadId; assert.ok(uploadId); assert.equal(e.state.editing, false);
    await m.upload(); assert.match(m.state.message, /uncertain/); assert.equal(m.state.uploadId, uploadId); assert.equal(m.state.chosen?.handle, 'grant'); assert.equal(m.state.progress?.bytes, 4);
    f.succeed(); await m.upload(); assert.deepEqual(f.calls.filter(c => c.method === 'upload').map(c => c.input.uploadId), [uploadId, uploadId]); assert.equal(m.state.chosen, undefined); assert.match(m.state.message, /已保存/);
    m.askDelete(item); m.cancelDelete(); assert.equal(f.calls.filter(c => c.method === 'deleteAttachment').length, 0);
    m.askDelete(item); await m.confirmDelete(); assert.match(m.state.message, /清理尚未完成/); assert.deepEqual(f.calls.find(c => c.method === 'deleteAttachment')?.input, { id: item.id, confirm: true });
    e.state.record = { ...record, deletedAt: 2 }; await tick(); f.calls.length = 0;
    await m.choose(); m.askDelete(item); await m.confirmDelete(); assert.equal(f.calls.length, 0); await m.save(item.id); assert.ok(f.calls.some(c => c.method === 'save'));
  } finally { await f.ctx.fiber.dispose(); }
});
test('session changes cancel native transfer, clear grants and ignore late success; provider withdrawal removes only its contribution', async () => {
  const f = await fixture(), m = f.ctx.recorderRecordAttachments;
  try {
    await m.choose(); const pending = f.defer(), upload = m.upload(); await tick(); assert.equal(f.ctx.recorderLeave.dirty, true);
    f.state.identity = undefined; await tick(); assert.ok(f.calls.some(c => c.method === 'cancel')); assert.ok(f.calls.some(c => c.method === 'clear')); assert.equal(m.state.busy, false);
    const atLogout = f.calls.length; pending.resolve({ ok: true, value: item }); await upload; assert.equal(f.calls.length, atLogout); assert.deepEqual(m.state.items, []); assert.equal(m.state.message, '');
    await f.provider.dispose(); await f.contribution.await(); assert.deepEqual(f.ctx.recorderPanels.items, []); assert.ok(f.ctx.recorderEditor);
  } finally { await f.ctx.fiber.dispose(); }
  assert.equal(f.subscribed, false);
});
test('clients without a file device adapter explicitly report unavailable and issue no file operations', async () => {
  const f = await fixture(false);
  try { assert.equal(f.ctx.recorderFileTransfer.available, false); await f.ctx.recorderRecordAttachments.choose(); assert.equal(f.calls.some(c => c.method === 'choose'), false); assert.equal(f.ctx.recorderRecordAttachments.state.loaded, true); }
  finally { await f.ctx.fiber.dispose(); }
});
