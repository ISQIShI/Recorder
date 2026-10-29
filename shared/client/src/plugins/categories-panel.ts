import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h, ref, watch } from 'vue';
import { categoryPath, categoryRows } from '../category-tree.js';
import './record-categories.js';
import './record-editor.js';
import './account.js';
import '../services.js';
export const inject = ['recorderPanels', 'recorderRecordCategories', 'recorderAccount', 'recorderEditor'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'categories', component: defineComponent({ setup() {
    const name = ref(''), parent = ref(''), existing = ref(''), scope = ref(''), query = ref('');
    watch(() => ctx.recorderAccount.state.identity?.sessionId, () => { name.value = ''; parent.value = ''; existing.value = ''; scope.value = ''; query.value = ''; });
    const model = ctx.recorderRecordCategories, state = model.state, editor = ctx.recorderEditor;
    return () => {
      if (!ctx.recorderAccount.state.identity) return null;
      const path = (id: string) => categoryPath(state.nodes, id), rows = categoryRows(state.nodes);
      const options = () => rows.map(({ node }) => h('option', { key: node.id, value: node.id }, path(node.id)));
      const edit = state.edit, disabled = state.busy || editor.state.busy || !state.treeLoaded;
      return [
        h('h2', '分层分类'), h('p', { class: 'muted' }, '分类独立于记录正文。先保存记录再管理归属；分类写入前会通过草稿提醒结束当前记录编辑。'),
        h('button', { 'data-refresh-categories': '', disabled: state.busy, onClick: () => model.refresh() }, '刷新分类与结果'),
        h('div', { class: 'categories-grid' }, [
          h('div', [h('h3', '分类树'), state.treeLoading ? h('p', '正在读取分类树…') : !state.treeLoaded ? h('p', '分类树尚未读取成功，请刷新。') : !rows.length ? h('p', '暂无分类，可创建顶层分类。') : h('ul', { class: 'category-tree' }, rows.map(({ node, depth }) =>
            h('li', { key: node.id, style: { marginLeft: `${depth * 16}px` } }, [h('button', { 'data-category-node': node.id, disabled, onClick: () => model.selectNode(node.id) }, `${depth ? '↳ ' : ''}${path(node.id)}`)]))),
          ]),
          h('div', [h('h3', '创建顶层或子分类'),
            h('form', { onSubmit: (e: Event) => { e.preventDefault(); void model.create(name.value, parent.value || null); } }, [h('fieldset', { disabled }, [
              h('label', ['名称（去除首尾空白后 1–64）', h('input', { name: 'categoryName', value: name.value, onInput: (e: Event) => { name.value = (e.target as HTMLInputElement).value; } })]),
              h('label', ['父分类', h('select', { name: 'categoryParent', value: parent.value, onChange: (e: Event) => { parent.value = (e.target as HTMLSelectElement).value; } }, [h('option', { value: '' }, '顶层'), ...options()])]),
              h('button', { type: 'submit', 'data-create-category': '', disabled: !name.value.trim() || name.value.trim().length > 64 }, '创建分类'),
            ])]),
            edit ? h('form', { 'data-category-edit': edit.id, onSubmit: (e: Event) => { e.preventDefault(); void model.saveNode(); } }, [
              h('h3', `更名或移动 · 版本 ${edit.expectedRevision}`), h('p', `已载入：${path(edit.id) || '分类已不存在'}`),
              h('fieldset', { disabled }, [
                h('label', ['名称', h('input', { name: 'editCategoryName', value: edit.name, onInput: (e: Event) => { edit.name = (e.target as HTMLInputElement).value; } })]),
                h('label', ['移动到父分类', h('select', { name: 'editCategoryParent', value: edit.parentId ?? '', onChange: (e: Event) => { edit.parentId = (e.target as HTMLSelectElement).value || null; } }, [h('option', { value: '' }, '顶层'), ...options()])]),
                h('button', { 'data-save-category': '', type: 'submit', disabled: !edit.name.trim() || edit.name.trim().length > 64 }, '保存名称与位置'),
                h('button', { 'data-reload-category': '', type: 'button', onClick: () => model.selectNode(edit.id) }, '重新载入分类（替换名称/位置输入）'),
                h('button', { 'data-delete-category': '', type: 'button', onClick: () => model.askDelete(edit.id) }, '删除此分类及全部子分类'),
              ]), h('p', { class: 'muted' }, '冲突时输入和原版本保留。请先刷新分类，核对后再明确重新载入；不会自动覆盖。'),
            ]) : h('p', '选择树中的分类以更名、移动或删除。'),
          ]),
        ]),
        state.deleting ? h('div', { role: 'alertdialog', 'aria-label': '确认删除分类树', 'data-category-delete-confirmation': '' }, [
          h('p', `将删除「${path(state.deleting.id) || state.deleting.name}」及执行时的全部子分类和这些分类的归属关系，无法恢复。所有正常和回收站记录、标签、树外分类归属均保留；不会把记录移入回收站。`),
          h('button', { 'data-cancel-category-delete': '', disabled, onClick: () => model.cancelDelete() }, '取消'),
          h('button', { 'data-confirm-category-delete': '', disabled, onClick: () => model.confirmDelete() }, '确认删除整棵分类树，保留所有记录'),
        ]) : null,
        h('div', { class: 'categories-grid' }, [
          h('div', { 'data-record-categories': editor.state.record?.id ?? '' }, [
            h('h3', editor.state.record ? `当前记录分类：${editor.state.record.title || '无标题记录'}${editor.state.record.deletedAt !== null ? ' · 回收站只读' : ''}` : '先选择已保存记录再管理归属'),
            state.loading ? h('p', '正在读取分类归属…') : state.linksLoaded ? state.links.length ? h('ul', state.links.map(node => h('li', { key: node.id, 'data-record-category': node.id }, [
              h('span', path(node.id)), editor.state.record?.deletedAt === null ? h('button', { 'data-remove-category': node.id, disabled, onClick: () => model.remove(node.id) }, '解除归属') : null,
            ]))) : h('p', '暂无分类。') : editor.state.record ? h('p', '分类归属尚未读取成功，请刷新。') : null,
            editor.state.record?.deletedAt === null ? h('form', { onSubmit: (e: Event) => { e.preventDefault(); void model.add(existing.value); } }, [
              h('fieldset', { disabled: disabled || state.loading || !state.linksLoaded }, [
                h('label', ['加入分类', h('select', { name: 'recordCategory', value: existing.value, onChange: (e: Event) => { existing.value = (e.target as HTMLSelectElement).value; } }, [h('option', { value: '' }, '选择完整分类路径'), ...options()])]),
                h('button', { 'data-add-category': '', type: 'submit', disabled: !existing.value }, '添加归属'),
              ]),
            ]) : null,
          ]),
          h('div', [h('h3', '按分类查找'), h('form', { onSubmit: (e: Event) => { e.preventDefault(); void model.filter(scope.value, query.value); } }, [
            h('label', ['分类（包含全部子分类）', h('select', { name: 'categoryFilter', value: scope.value, onChange: (e: Event) => { scope.value = (e.target as HTMLSelectElement).value; } }, [h('option', { value: '' }, '选择分类'), ...options()])]),
            h('label', ['标题或正文关键词', h('input', { name: 'categoryQuery', maxlength: 200, value: query.value, onInput: (e: Event) => { query.value = (e.target as HTMLInputElement).value; } })]),
            h('button', { 'data-filter-categories': '', type: 'submit', disabled: disabled || state.filtering }, '查询分类及全部子分类'),
          ]),
          state.filtering ? h('p', '正在查询…') : state.scopeId && state.resultsReady ? h('div', { 'data-category-results': '' }, [
            h('p', { 'data-category-total': '' }, `「${path(state.scopeId)}」及全部子分类 · 去重后 ${state.total} 条正常记录`),
            state.items.length ? h('ul', state.items.map(record => h('li', { key: record.id }, [h('button', { 'data-category-record': record.id, disabled, onClick: () => editor.select(record.id) }, record.title || '无标题记录')]))) : h('p', '没有匹配记录。'),
            h('div', { class: 'actions' }, [
              h('button', { 'data-categories-previous': '', disabled: disabled || state.offset === 0, onClick: () => model.filter(state.scopeId, state.q, Math.max(0, state.offset - 30)) }, '上一页'),
              h('span', `第 ${Math.floor(state.offset / 30) + 1} 页`),
              h('button', { 'data-categories-next': '', disabled: disabled || state.offset + 30 >= state.total, onClick: () => model.filter(state.scopeId, state.q, state.offset + 30) }, '下一页'),
            ]),
          ]) : h('p', state.scopeId ? '查询未完成，请重新查询或刷新。' : '选择分类查询正常记录，范围包含其全部子分类并按记录去重。'),
          ]),
        ]), h('p', { role: 'status', 'data-categories-message': '' }, state.message),
      ];
    };
  } }) });
}
