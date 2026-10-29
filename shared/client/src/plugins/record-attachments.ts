import type { Context } from '@deepseek-ai/cordis';
import { reactive, watch } from 'vue';
import type { AttachmentData, ChosenFile, FileProgress } from '@recorder/contracts';
import './file-transfer.js';
import './record-editor.js';
import './account.js';
import '../api-transport.js';
export interface AttachmentModel {
  state: { items: AttachmentData[]; loading: boolean; loaded: boolean; busy: boolean; message: string; chosen?: ChosenFile; uploadId?: string; progress?: FileProgress; deleting?: AttachmentData };
  refresh(): Promise<void>; choose(): Promise<void>; upload(): Promise<void>; save(id: string): Promise<void>; cancel(): void; askDelete(item: AttachmentData): void; cancelDelete(): void; confirmDelete(): Promise<void>;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderRecordAttachments: AttachmentModel } }
export const inject = ['recorderFileTransfer', 'recorderEditor', 'recorderAccount', 'recorderApi', 'recorderLeave'];
export function apply(ctx: Context) {
  ctx.effect(() => {
    const empty = () => ({ items: [] as AttachmentData[], loading: false, loaded: false, busy: false, message: '', chosen: undefined, uploadId: undefined, progress: undefined, deleting: undefined });
    const state = reactive<AttachmentModel['state']>(empty()), editor = ctx.recorderEditor, account = ctx.recorderAccount, files = ctx.recorderFileTransfer;
    let active = true, generation = 0, request = 0, controller: AbortController | undefined;
    const identity = () => account.state.identity?.sessionId, selected = () => editor.state.record?.id;
    function reset() { generation++; request++; controller?.abort(); files.clear(); Object.assign(state, empty()); }
    async function refresh() {
      const session = identity(), id = selected(), serial = ++request; state.items = []; state.loaded = false; state.loading = !!id;
      if (!session || !id) return;
      try { const result = await ctx.recorderApi.request('listAttachments', { id }); if (active && identity() === session && selected() === id && request === serial) { state.items = result.items; state.loaded = true; } }
      finally { if (active && identity() === session && request === serial) state.loading = false; }
    }
    async function run(action: (valid: () => boolean, signal: AbortSignal) => Promise<void>) {
      if (state.busy || !identity() || !selected()) return;
      const version = generation, valid = () => active && generation === version;
      const current = new AbortController(); controller = current; state.busy = true; state.message = ''; state.progress = undefined;
      try { await action(valid, current.signal); } catch (error) { if (valid()) state.message = account.error(error); }
      finally { if (valid()) { state.busy = false; controller = undefined; } }
    }
    function writeGuard() { if (state.busy || editor.state.busy || editor.state.record?.deletedAt !== null) return false; if (editor.state.editing) editor.cancel(); return !editor.state.editing; }
    const model: AttachmentModel = {
      state, refresh: () => run(async () => { await refresh(); }),
      async choose() { if (!writeGuard() || !files.available) return; await run(async valid => { const chosen = await files.choose(); if (valid() && chosen) { state.chosen = chosen; state.uploadId = crypto.randomUUID(); state.message = '文件尚未上传；原文件将保留。'; } }); },
      async upload() {
        if (!state.chosen || !state.uploadId || !writeGuard()) return;
        const chosen = { ...state.chosen }, uploadId = state.uploadId, id = selected()!;
        await run(async (valid, signal) => {
          try { await files.upload(chosen, id, uploadId, signal, value => { if (valid()) state.progress = value; }); if (valid()) { state.chosen = undefined; state.uploadId = undefined; state.message = '附件已保存到后端；原文件保留。'; } }
          finally { if (valid()) await refresh(); }
        });
      },
      async save(id) { if (!files.available) return; await run(async (valid, signal) => { const saved = await files.save(id, signal, value => { if (valid()) state.progress = value; }); if (valid()) state.message = saved ? '已另存为，文件摘要校验通过。' : '已取消另存为。'; }); },
      cancel() { controller?.abort(); state.message = '已请求取消，请等待结果；上传可能已完成，可刷新附件核对。'; },
      askDelete(item) { if (!state.busy) state.deleting = { ...item }; }, cancelDelete() { if (!state.busy) state.deleting = undefined; },
      async confirmDelete() {
        if (!state.deleting || !writeGuard()) return; const id = state.deleting.id;
        await run(async valid => { const result = await ctx.recorderApi.request('deleteAttachment', { id, confirm: true }); if (valid()) { state.deleting = undefined; state.message = result.pending ? '删除意图已保存，文件清理尚未完成，请稍后重试删除。' : '附件已永久删除；记录和原文件保留。'; await refresh(); } });
      },
    };
    ctx.recorderLeave.register(ctx, () => state.busy);
    const load = () => { const version = generation; if (identity() && selected()) void refresh().catch(error => { if (active && generation === version) state.message = account.error(error); }); };
    const stopAccount = watch(identity, () => { reset(); load(); }, { flush: 'sync', immediate: true });
    const stopRecord = watch([selected, () => editor.state.record?.deletedAt], () => { reset(); load(); }, { flush: 'sync' });
    ctx.provide('recorderRecordAttachments', model);
    return () => { active = false; stopAccount(); stopRecord(); reset(); };
  });
}
