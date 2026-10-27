import type { Context } from '@deepseek-ai/cordis';
import { reactive, watch } from 'vue';
import type { RecordData, TagData } from '@recorder/contracts';
import './account.js';
import './record-editor.js';
import '../api-transport.js';

export interface TagsState {
  dictionary: TagData[]; tags: TagData[]; loading: boolean; tagsLoaded: boolean; busy: boolean; message: string;
  tagId: string; q: string; offset: number; items: RecordData[]; total: number; filtering: boolean; resultsReady: boolean;
}
export interface RecordTagsModel {
  state: TagsState; refresh(): Promise<void>; create(name: string): Promise<void>; add(tagId: string): Promise<void>;
  remove(tagId: string): Promise<void>; filter(tagId: string, q: string, offset?: number): Promise<void>;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderRecordTags: RecordTagsModel } }
export const inject = ['recorderAccount', 'recorderApi', 'recorderEditor'];
export function apply(ctx: Context) {
  ctx.effect(() => {
    const state = reactive<TagsState>({ dictionary: [], tags: [], loading: false, tagsLoaded: false, busy: false, message: '', tagId: '', q: '', offset: 0, items: [], total: 0, filtering: false, resultsReady: false });
    const account = ctx.recorderAccount, editor = ctx.recorderEditor;
    let active = true, generation = 0, tagsRequest = 0, filterRequest = 0, dictionaryRequest = 0;
    const session = () => account.state.identity?.sessionId;
    const valid = (current: string | undefined) => active && !!current && current === session();
    async function dictionary() {
      const current = session(), request = ++dictionaryRequest;
      const result = await ctx.recorderApi.request('listTags', {});
      if (valid(current) && request === dictionaryRequest) state.dictionary = result.items;
    }
    async function selected() {
      const current = session(), id = editor.state.record?.id, request = ++tagsRequest;
      state.tags = []; state.tagsLoaded = false; state.loading = !!id;
      if (!id) return;
      try {
        const result = await ctx.recorderApi.request('getRecordTags', { id });
        if (valid(current) && request === tagsRequest) { state.tags = result.items; state.tagsLoaded = true; }
      } finally { if (valid(current) && request === tagsRequest) state.loading = false; }
    }
    async function results() {
      const current = session(), request = ++filterRequest, id = state.tagId;
      state.resultsReady = false;
      if (!id) { state.items = []; state.total = 0; state.filtering = false; return; }
      state.filtering = true;
      try {
        let result = await ctx.recorderApi.request('listTagRecords', { id, q: state.q, limit: 30, offset: state.offset });
        if (!valid(current) || request !== filterRequest) return;
        if (!result.items.length && state.offset > 0) {
          state.offset = Math.floor(Math.max(0, result.total - 1) / 30) * 30;
          result = await ctx.recorderApi.request('listTagRecords', { id, q: state.q, limit: 30, offset: state.offset });
        }
        if (valid(current) && request === filterRequest) { state.items = result.items; state.total = result.total; state.resultsReady = true; }
      } finally { if (valid(current) && request === filterRequest) state.filtering = false; }
    }
    async function refresh() { await Promise.all([dictionary(), selected(), results()]); }
    async function run(action: (current: () => boolean) => Promise<void>) {
      if (state.busy || !session()) return;
      const current = session(), actionGeneration = generation;
      const stillCurrent = () => valid(current) && actionGeneration === generation;
      state.busy = true; state.message = '';
      try { await action(stillCurrent); }
      catch (error) { if (stillCurrent()) state.message = account.error(error); }
      finally { if (stillCurrent()) state.busy = false; }
    }
    function writable() {
      if (state.busy || state.loading || !state.tagsLoaded || editor.state.busy) return;
      if (editor.state.editing) editor.cancel(); // Same leave guard; cancellation preserves the draft and makes no tag request.
      if (editor.state.editing) return;
      const record = editor.state.record;
      if (record && record.deletedAt === null) return record.id;
    }
    async function change(tagId: string, add: boolean) {
      const id = writable(); if (!id) return;
      await run(async current => {
        await ctx.recorderApi.request(add ? 'addRecordTag' : 'removeRecordTag', { id, tagId });
        if (!current()) return;
        state.message = add ? '已添加标签。' : '已移除关联，标签和记录仍保留。';
        await refresh();
      });
    }
    ctx.provide('recorderRecordTags', {
      state, refresh: () => run(async () => { await refresh(); }),
      add: tagId => change(tagId, true), remove: tagId => change(tagId, false),
      async create(name) {
        const id = writable(); if (!id) return;
        await run(async current => {
          const tag = await ctx.recorderApi.request('createTag', { name });
          if (!current()) return;
          // Dictionary creation and association are deliberately separate API operations.
          try { await ctx.recorderApi.request('addRecordTag', { id, tagId: tag.id }); }
          catch (error) {
            if (current()) { await dictionary(); throw new Error('标签已创建或复用，但添加关联失败：' + account.error(error)); }
            return;
          }
          if (!current()) return;
          state.message = '已创建或复用标签，并添加到记录。'; await refresh();
        });
      },
      async filter(tagId, q, offset = 0) {
        if (state.busy || state.filtering || !editor.leave()) return;
        state.tagId = tagId; state.q = q; state.offset = offset;
        await run(async () => { await results(); });
      },
    } satisfies RecordTagsModel);
    function update(action: () => Promise<void>) {
      const current = session();
      if (current) void action().catch(error => { if (valid(current)) state.message = account.error(error); });
    }
    const stopAccount = watch(session, () => {
      generation++; tagsRequest++; filterRequest++; dictionaryRequest++;
      Object.assign(state, { dictionary: [], tags: [], loading: false, tagsLoaded: false, busy: false, message: '', tagId: '', q: '', offset: 0, items: [], total: 0, filtering: false, resultsReady: false });
      update(refresh);
    }, { immediate: true, flush: 'sync' });
    const stopRecord = watch(() => editor.state.record, () => update(async () => { await Promise.all([selected(), results()]); }));
    return () => { active = false; generation++; stopAccount(); stopRecord(); Object.assign(state, { dictionary: [], tags: [], items: [], message: '' }); };
  });
}
