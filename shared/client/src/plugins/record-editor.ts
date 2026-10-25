import type { Context } from '@deepseek-ai/cordis';
import { reactive, watch } from 'vue';
import { ApiError, type RecordData, type BodyFormat } from '@recorder/contracts';
import './account.js';
import './leave-guard.js';

type Draft = { title: string; body: string; format: BodyFormat };
export interface RecordEditor {
  state: { record?: RecordData; baseline?: RecordData; draft: Draft; editing: boolean; busy: boolean; conflict: boolean; latest?: RecordData; message: string };
  readonly dirty: boolean;
  select(id: string): Promise<void>; begin(): Promise<void>; change(patch: Partial<Draft>): void;
  save(): Promise<RecordData | undefined>; cancel(): void; viewLatest(): Promise<void>; discard(): Promise<void>;
  rebase(): void; hideLatest(): void;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderEditor: RecordEditor } }
export const inject = ['recorderAccount', 'recorderApi', 'recorderLeave'];
const draftOf = (record?: RecordData): Draft => ({ title: record?.title ?? '', body: record?.body ?? '', format: record?.format ?? 'plain' });
export function apply(ctx: Context) {
  const state: RecordEditor['state'] = reactive({ draft: draftOf(), editing: false, busy: false, conflict: false, message: '' });
  let active = true, generation = 0;
  const dirty = () => state.editing && !!state.baseline && (['title', 'body', 'format'] as const).some(key => state.draft[key] !== state.baseline![key]);
  const resetEdit = () => { state.editing = false; state.baseline = undefined; state.draft = draftOf(); state.latest = undefined; state.conflict = false; state.message = ''; };
  const reset = () => { generation++; resetEdit(); state.record = undefined; state.busy = false; };
  ctx.effect(() => {
    const stop = watch(() => ctx.recorderAccount.state.identity?.sessionId, reset, { flush: 'sync' });
    return () => { active = false; stop(); reset(); };
  });
  ctx.recorderLeave.register(ctx, () => dirty() || (state.editing && state.busy));
  async function run(action: (valid: () => boolean) => Promise<void>, saving = false) {
    if (state.busy || !ctx.recorderAccount.state.identity) return;
    const version = ++generation, session = ctx.recorderAccount.state.identity.sessionId;
    const valid = () => active && version === generation && ctx.recorderAccount.state.identity?.sessionId === session;
    state.busy = true; state.message = '';
    try { await action(valid); }
    catch (error) {
      if (!valid()) return;
      if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
        state.conflict = true;
        state.message = '版本冲突：草稿仍在当前窗口内存中，编辑基线未改变。请查看后端最新内容后决定如何处理。';
      } else {
        const message = ctx.recorderAccount.error(error);
        if (!valid()) return;
        const uncertain = saving && (!(error instanceof ApiError) || ['CONNECTION_FAILED', 'INVALID_RESPONSE'].includes(error.code));
        state.message = uncertain ? '保存结果尚未确认，可能已写入后端。草稿与原版本已保留，请查看后端最新内容核对；重试仍使用原版本。' : message;
      }
    } finally { if (valid()) state.busy = false; }
  }
  const editor: RecordEditor = {
    state,
    get dirty() { return dirty(); },
    async select(id) {
      if (state.busy || (state.record?.id === id && state.editing) || !ctx.recorderLeave.confirm()) return;
      await run(async valid => {
        const record = await ctx.recorderApi.request('getRecord', { id });
        if (!valid()) return;
        resetEdit(); state.record = record;
      });
    },
    async begin() {
      if (!state.record || state.editing) return;
      const id = state.record.id;
      await run(async valid => {
        const record = await ctx.recorderApi.request('getRecord', { id });
        if (!valid()) return;
        state.record = record; state.baseline = record; state.draft = draftOf(record); state.editing = true;
      });
    },
    change(patch) { if (state.editing && !state.busy) Object.assign(state.draft, patch); },
    async save() {
      if (!state.baseline || !dirty() || state.busy) return;
      const input = { id: state.baseline.id, expectedRevision: state.baseline.revision, ...state.draft };
      let saved: RecordData | undefined;
      await run(async valid => {
        const result = await ctx.recorderApi.request('updateRecord', input);
        if (!valid()) return;
        state.record = result; state.baseline = result; state.draft = draftOf(result); state.latest = undefined; state.conflict = false;
        state.message = '已保存到后端'; saved = result;
      }, true);
      return saved;
    },
    cancel() { if (!state.busy && ctx.recorderLeave.confirm()) resetEdit(); },
    async viewLatest() {
      if (!state.baseline) return;
      const id = state.baseline.id;
      await run(async valid => {
        const latest = await ctx.recorderApi.request('getRecord', { id });
        if (valid()) { state.latest = latest; state.message = '正在对照后端最新内容；你的草稿和编辑基线均未改变。'; }
      });
    },
    async discard() {
      if (!state.baseline || state.busy || !ctx.recorderLeave.confirm()) return;
      const id = state.baseline.id;
      await run(async valid => {
        const latest = await ctx.recorderApi.request('getRecord', { id });
        if (!valid()) return;
        state.record = latest; state.baseline = latest; state.draft = draftOf(latest); state.latest = undefined; state.conflict = false;
        state.message = '已放弃内存草稿，加载后端最新记录。';
      });
    },
    rebase() {
      if (!state.latest || state.busy) return;
      state.baseline = state.latest; state.record = state.latest; state.latest = undefined; state.conflict = false;
      state.message = '已明确改用最新版本为基线，保留自己的草稿。请整理对照内容后手动保存；后端再次变化仍会提示冲突。';
    },
    hideLatest() { state.latest = undefined; },
  };
  ctx.provide('recorderEditor', editor);
}
