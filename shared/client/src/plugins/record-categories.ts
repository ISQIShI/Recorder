import type { Context } from '@deepseek-ai/cordis';
import { reactive, watch } from 'vue';
import type { ApiInputs, CategoryData, RecordData } from '@recorder/contracts';
import './account.js';
import './record-editor.js';
import '../api-transport.js';
export interface CategoriesState {
  nodes: CategoryData[]; treeLoading: boolean; treeLoaded: boolean; links: CategoryData[]; loading: boolean; linksLoaded: boolean; busy: boolean; message: string;
  edit?: ApiInputs['updateCategory']; deleting?: CategoryData;
  scopeId: string; q: string; offset: number; items: RecordData[]; total: number; filtering: boolean; resultsReady: boolean;
}
export interface RecordCategoriesModel {
  state: CategoriesState; refresh(): Promise<void>; create(name: string, parentId: string | null): Promise<void>;
  selectNode(id: string): void; saveNode(): Promise<void>; askDelete(id: string): void; cancelDelete(): void; confirmDelete(): Promise<void>;
  add(categoryId: string): Promise<void>; remove(categoryId: string): Promise<void>; filter(id: string, q: string, offset?: number): Promise<void>;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderRecordCategories: RecordCategoriesModel } }
export const inject = ['recorderAccount', 'recorderApi', 'recorderEditor'];
const empty = (): CategoriesState => ({ nodes: [], treeLoading: false, treeLoaded: false, links: [], loading: false, linksLoaded: false, busy: false, message: '', edit: undefined, deleting: undefined,
  scopeId: '', q: '', offset: 0, items: [], total: 0, filtering: false, resultsReady: false });
export function apply(ctx: Context) {
  ctx.effect(() => {
    const state = reactive(empty()), account = ctx.recorderAccount, editor = ctx.recorderEditor;
    let active = true, generation = 0, treeRequest = 0, linkRequest = 0, resultRequest = 0;
    const session = () => account.state.identity?.sessionId;
    const valid = (current: string | undefined) => active && !!current && current === session();
    async function tree() {
      const current = session(), request = ++treeRequest;
      state.treeLoading = true; state.treeLoaded = false;
      try {
        const result = await ctx.recorderApi.request('listCategories', {});
        if (!valid(current) || request !== treeRequest) return;
        state.nodes = result.items; state.treeLoaded = true;
        if (state.scopeId && !result.items.some(node => node.id === state.scopeId)) { state.scopeId = ''; state.items = []; state.total = 0; state.resultsReady = false; }
      } finally { if (valid(current) && request === treeRequest) state.treeLoading = false; }
    }
    async function links() {
      const current = session(), id = editor.state.record?.id, request = ++linkRequest;
      state.links = []; state.linksLoaded = false; state.loading = !!id;
      if (!id) return;
      try {
        const result = await ctx.recorderApi.request('getRecordCategories', { id });
        if (valid(current) && request === linkRequest) { state.links = result.items; state.linksLoaded = true; }
      } finally { if (valid(current) && request === linkRequest) state.loading = false; }
    }
    async function results() {
      const current = session(), id = state.scopeId, request = ++resultRequest;
      state.resultsReady = false;
      if (!id) { state.items = []; state.total = 0; state.filtering = false; return; }
      state.filtering = true;
      try {
        let result = await ctx.recorderApi.request('listCategoryRecords', { id, q: state.q, limit: 30, offset: state.offset });
        if (!valid(current) || request !== resultRequest) return;
        if (!result.items.length && state.offset > 0) {
          state.offset = Math.floor(Math.max(0, result.total - 1) / 30) * 30;
          result = await ctx.recorderApi.request('listCategoryRecords', { id, q: state.q, limit: 30, offset: state.offset });
        }
        if (valid(current) && request === resultRequest) { state.items = result.items; state.total = result.total; state.resultsReady = true; }
      } finally { if (valid(current) && request === resultRequest) state.filtering = false; }
    }
    async function refresh() { const current = session(); await tree(); if (valid(current)) await Promise.all([links(), results()]); }
    async function run(action: (current: () => boolean) => Promise<void>) {
      if (state.busy || !session()) return;
      const current = session(), version = generation, stillCurrent = () => valid(current) && version === generation;
      state.busy = true; state.message = '';
      try { await action(stillCurrent); } catch (error) { if (stillCurrent()) state.message = account.error(error); }
      finally { if (stillCurrent()) state.busy = false; }
    }
    function endEdit() {
      if (state.busy || editor.state.busy) return false;
      if (editor.state.editing) editor.cancel();
      return !editor.state.editing;
    }
    const editOf = (node: CategoryData) => ({ id: node.id, name: node.name, parentId: node.parentId, expectedRevision: node.revision });
    async function associate(categoryId: string, add: boolean) {
      if (!state.linksLoaded || state.loading || !endEdit()) return;
      const record = editor.state.record; if (!record || record.deletedAt !== null) return;
      await run(async current => {
        await ctx.recorderApi.request(add ? 'addRecordCategory' : 'removeRecordCategory', { id: record.id, categoryId });
        if (!current()) return;
        state.message = add ? '已添加分类归属。' : '已解除归属，记录和分类仍保留。'; await refresh();
      });
    }
    ctx.provide('recorderRecordCategories', {
      state, refresh: () => run(async () => { await refresh(); }),
      async create(name, parentId) {
        if (!endEdit()) return;
        await run(async current => {
          const node = await ctx.recorderApi.request('createCategory', { name, parentId });
          if (!current()) return;
          state.edit = editOf(node); state.message = '已创建分类。'; await refresh();
        });
      },
      selectNode(id) { if (!state.busy) { const node = state.nodes.find(node => node.id === id); if (node) { state.edit = editOf(node); state.deleting = undefined; } } },
      async saveNode() {
        if (!state.edit || !endEdit()) return;
        const input = { ...state.edit };
        await run(async current => {
          const node = await ctx.recorderApi.request('updateCategory', input);
          if (!current()) return;
          state.edit = editOf(node); state.message = '已保存分类名称和位置。'; await refresh();
        });
      },
      askDelete(id) { if (!state.busy) { const node = state.nodes.find(node => node.id === id); if (node) state.deleting = { ...node }; } },
      cancelDelete() { if (!state.busy) state.deleting = undefined; },
      async confirmDelete() {
        if (!state.deleting || !endEdit()) return;
        const { id, revision } = state.deleting;
        await run(async current => {
          const result = await ctx.recorderApi.request('deleteCategory', { id, expectedRevision: revision, confirm: true });
          if (!current()) return;
          state.deleting = undefined; state.message = `已删除 ${result.deleted} 个分类；所有记录、标签及树外分类归属保留。`;
          await refresh(); if (current() && state.edit && !state.nodes.some(node => node.id === state.edit!.id)) state.edit = undefined;
        });
      },
      add: id => associate(id, true), remove: id => associate(id, false),
      async filter(id, q, offset = 0) {
        if (state.busy || state.filtering || !editor.leave()) return;
        state.scopeId = id; state.q = q; state.offset = offset; await run(async () => { await results(); });
      },
    } satisfies RecordCategoriesModel);
    function update(action: () => Promise<void>) {
      const current = session(); if (current) void action().catch(error => { if (valid(current)) state.message = account.error(error); });
    }
    const stopAccount = watch(session, () => { generation++; treeRequest++; linkRequest++; resultRequest++; Object.assign(state, empty()); update(refresh); }, { immediate: true, flush: 'sync' });
    const stopRecord = watch(() => editor.state.record, () => update(async () => { await Promise.all([links(), results()]); }));
    return () => { active = false; generation++; stopAccount(); stopRecord(); Object.assign(state, empty()); };
  });
}
