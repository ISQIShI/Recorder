import type { Context } from '@deepseek-ai/cordis';
import { reactive, watch } from 'vue';
import type { ChosenFile, FileProgress, RecordData } from '@recorder/contracts';
import './file-transfer.js';
import './record-editor.js';
import './account.js';
export interface FileRecords {
  state: { chosen?: ChosenFile; uploadId?: string; created?: RecordData; busy: boolean; message: string; progress?: FileProgress };
  choose(): Promise<void>; create(): Promise<void>; cancel(): void; open(): Promise<void>;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderFileRecords: FileRecords } }
export const inject = ['recorderFileTransfer', 'recorderEditor', 'recorderAccount', 'recorderLeave'];
export function apply(ctx: Context) {
  ctx.effect(() => {
    const state = reactive<FileRecords['state']>({ busy: false, message: '' }), files = ctx.recorderFileTransfer, editor = ctx.recorderEditor;
    let active = true, generation = 0, controller: AbortController | undefined;
    const session = () => ctx.recorderAccount.state.identity?.sessionId;
    function reset() { generation++; controller?.abort(); files.clear(); Object.assign(state, { chosen: undefined, uploadId: undefined, created: undefined, busy: false, message: '', progress: undefined }); }
    function guard() { if (state.busy || editor.state.busy || !session()) return false; if (editor.state.editing) editor.cancel(); return !editor.state.editing; }
    async function run(action: (valid: () => boolean, signal: AbortSignal) => Promise<void>) {
      const version = generation, valid = () => active && version === generation;
      const current = new AbortController(); controller = current; state.busy = true; state.message = ''; state.progress = undefined;
      try { await action(valid, current.signal); }
      catch (error) { if (valid()) { const message = ctx.recorderAccount.error(error); if (valid()) state.message = message + '；结果可能尚未确认。保留本次选择，可重试同一次请求，或查询记录核对。'; } }
      finally { if (valid()) { state.busy = false; controller = undefined; } }
    }
    const model: FileRecords = {
      state,
      async choose() {
        if (!files.available || !guard()) return;
        await run(async valid => { const chosen = await files.choose(); if (valid() && chosen) { state.chosen = chosen; state.uploadId = crypto.randomUUID(); state.created = undefined; state.message = '文件尚未上传，尚未新建记录；原文件保留。'; } });
      },
      async create() {
        if (!state.chosen || !state.uploadId || !guard()) return;
        const chosen = { ...state.chosen }, uploadId = state.uploadId;
        await run(async (valid, signal) => {
          const result = await files.createRecord(chosen, uploadId, signal, value => { if (valid()) state.progress = value; });
          if (!valid()) return;
          state.created = result.record; state.chosen = undefined; state.uploadId = undefined; state.busy = false;
          state.message = '记录与首个附件已保存到后端；正文为空，原文件保留。';
          ctx.emit('recorder/record-created', result.record);
          await editor.select(result.record.id);
        });
      },
      cancel() { controller?.abort(); state.message = '已请求取消；结果尚未确认，可用同一次请求重试核对，不会重复建记录。'; },
      async open() { if (state.created && !state.busy) await editor.select(state.created.id); },
    };
    const stop = watch(session, reset, { flush: 'sync' });
    ctx.recorderLeave.register(ctx, () => state.busy);
    ctx.provide('recorderFileRecords', model);
    return () => { active = false; stop(); reset(); };
  });
}
