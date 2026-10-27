import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h, ref, watch } from 'vue';
import './record-tags.js';
import './record-editor.js';
import './account.js';
import '../services.js';
export const inject = ['recorderPanels', 'recorderRecordTags', 'recorderAccount', 'recorderEditor'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'tags', component: defineComponent({ setup() {
    const name = ref(''), existing = ref(''), tagFilter = ref(''), query = ref('');
    watch(() => ctx.recorderAccount.state.identity?.sessionId, () => { name.value = ''; existing.value = ''; tagFilter.value = ''; query.value = ''; });
    const model = ctx.recorderRecordTags, state = model.state, editor = ctx.recorderEditor;
    return () => !ctx.recorderAccount.state.identity ? null : [
      h('h2', '标签与筛选'),
      h('p', { class: 'muted' }, '先保存或选择记录，再管理多个标签。标签操作会先结束当前编辑；回收站中的标签只读。'),
      h('div', { 'data-record-tags': editor.state.record?.id ?? '' }, [
        h('h3', editor.state.record ? `当前记录：${editor.state.record.title || '无标题记录'}${editor.state.record.deletedAt !== null ? ' · 回收站只读' : ''}` : '尚未选择记录'),
        state.loading ? h('p', { role: 'status' }, '正在读取标签…') : h('ul', { 'data-tag-list': '' }, state.tags.map(tag => h('li', { key: tag.id, 'data-tag-id': tag.id }, [
          h('span', tag.name), editor.state.record?.deletedAt === null ? h('button', { 'data-remove-tag': tag.id, disabled: state.busy || editor.state.busy, onClick: () => model.remove(tag.id) }, '移除关联') : null,
        ]))),
        !state.loading && editor.state.record && !state.tagsLoaded ? h('p', '标签尚未读取成功，请刷新后再管理。') : null,
        state.tagsLoaded && !state.tags.length ? h('p', '此记录暂无标签。') : null,
        editor.state.record?.deletedAt === null ? h('fieldset', { disabled: state.busy || state.loading || !state.tagsLoaded || editor.state.busy }, [
          h('form', { onSubmit: (e: Event) => { e.preventDefault(); void model.create(name.value); } }, [
            h('label', ['新标签（首尾空白会去除，1–64 字符）', h('input', { name: 'tagName', value: name.value, onInput: (e: Event) => { name.value = (e.target as HTMLInputElement).value; } })]),
            h('button', { 'data-create-tag': '', type: 'submit', disabled: !name.value.trim() || name.value.trim().length > 64 }, '创建或复用并添加'),
          ]),
          h('form', { onSubmit: (e: Event) => { e.preventDefault(); void model.add(existing.value); } }, [
            h('label', ['已有标签', h('select', { name: 'existingTag', value: existing.value, onChange: (e: Event) => { existing.value = (e.target as HTMLSelectElement).value; } }, [
              h('option', { value: '' }, '选择标签'), ...state.dictionary.map(tag => h('option', { key: tag.id, value: tag.id }, tag.name)),
            ])]), h('button', { 'data-add-tag': '', type: 'submit', disabled: !existing.value }, '添加已有标签'),
          ]),
        ]) : null,
      ]),
      h('form', { onSubmit: (e: Event) => { e.preventDefault(); void model.filter(tagFilter.value, query.value); } }, [
        h('label', ['按一个标签筛选正常记录', h('select', { name: 'tagFilter', value: tagFilter.value, onChange: (e: Event) => { tagFilter.value = (e.target as HTMLSelectElement).value; } }, [
          h('option', { value: '' }, '选择标签'), ...state.dictionary.map(tag => h('option', { key: tag.id, value: tag.id }, tag.name)),
        ])]),
        h('label', ['标题或正文关键词', h('input', { name: 'tagQuery', maxlength: 200, value: query.value, onInput: (e: Event) => { query.value = (e.target as HTMLInputElement).value; } })]),
        h('button', { type: 'submit', 'data-filter-tags': '', disabled: state.busy || state.filtering || editor.state.busy }, '筛选'),
        h('button', { type: 'button', 'data-refresh-tags': '', disabled: state.busy, onClick: () => model.refresh() }, '刷新标签与结果'),
      ]),
      state.filtering ? h('p', { role: 'status' }, '正在筛选…') : state.tagId && state.resultsReady ? h('div', { 'data-tag-results': '' }, [
        h('p', { 'data-tag-total': '' }, `匹配 ${state.total} 条正常记录`),
        !state.items.length ? h('p', '没有匹配记录。') : h('ul', state.items.map(record => h('li', { key: record.id }, [
          h('button', { 'data-tag-record': record.id, disabled: state.busy || editor.state.busy, onClick: () => editor.select(record.id) }, record.title || '无标题记录'),
        ]))),
        h('div', { class: 'actions' }, [
          h('button', { 'data-tags-previous': '', disabled: state.busy || editor.state.busy || state.offset === 0, onClick: () => model.filter(state.tagId, state.q, Math.max(0, state.offset - 30)) }, '上一页'),
          h('span', `第 ${Math.floor(state.offset / 30) + 1} 页`),
          h('button', { 'data-tags-next': '', disabled: state.busy || editor.state.busy || state.offset + 30 >= state.total, onClick: () => model.filter(state.tagId, state.q, state.offset + 30) }, '下一页'),
        ]),
      ]) : h('p', state.tagId ? '筛选结果尚未读取成功，请重新筛选或刷新。' : '选择一个标签并筛选；也可叠加关键词。'),
      h('p', { role: 'status', 'data-tags-message': '' }, state.message),
    ];
  } }) });
}
