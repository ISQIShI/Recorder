import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h, ref, watch, onBeforeUnmount } from 'vue';
import type { BodyFormat, RecordData } from '@recorder/contracts';
import './account.js';
import './record-editor.js';
import '../services.js';
export const inject = ['recorderPanels', 'recorderAccount', 'recorderApi', 'recorderEditor'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'records', component: defineComponent({ setup() {
    const title = ref(''), body = ref(''), format = ref<BodyFormat>('plain'), query = ref(''), message = ref(''), busy = ref(false);
    const items = ref<RecordData[]>([]), total = ref(0), offset = ref(0);
    const editor = ctx.recorderEditor, edit = editor.state;
    let active = true, request = 0, pending: { signature: string; id: string } | undefined;
    const account = ctx.recorderAccount;
    async function refresh() {
      const generation = ++request, session = account.state.identity?.sessionId;
      if (!session) return;
      const result = await ctx.recorderApi.request('listRecords', { q: query.value, limit: 30, offset: offset.value });
      if (active && generation === request && account.state.identity?.sessionId === session) { items.value = result.items; total.value = result.total; }
    }
    async function run(action: () => Promise<void>) {
      if (busy.value) return;
      busy.value = true; message.value = '';
      const session = account.state.identity?.sessionId;
      try { await action(); } catch (error) { if (active && session === account.state.identity?.sessionId) message.value = account.error(error); }
      finally { if (active && session === account.state.identity?.sessionId) busy.value = false; }
    }
    watch(() => account.state.identity?.sessionId, () => {
      request++; title.value = ''; body.value = ''; items.value = []; query.value = ''; total.value = 0; offset.value = 0; pending = undefined; message.value = ''; busy.value = false;
      if (account.state.identity) void run(refresh);
    }, { immediate: true });
    onBeforeUnmount(() => { active = false; request++; });
    return () => !account.state.identity ? h('p', { class: 'muted' }, '登录后即可保存和查找记录。') : [
      h('div', { class: 'records-grid' }, [
        h('div', [h('span', { class: 'eyebrow' }, 'CAPTURE'), h('h2', '记录此刻'),
          h('form', { onSubmit: (e: Event) => { e.preventDefault(); void run(async () => {
            const session = account.state.identity?.sessionId;
            const input = { title: title.value, body: body.value, format: format.value };
            const signature = JSON.stringify(input);
            if (!pending || pending.signature !== signature) pending = { signature, id: crypto.randomUUID() };
            const record = await ctx.recorderApi.request('createRecord', { ...input, requestId: pending.id });
            if (!active || session !== account.state.identity?.sessionId) return;
            message.value = '已保存到后端';
            if (!edit.editing) await editor.select(record.id);
            if (!active || session !== account.state.identity?.sessionId) return;
            if (JSON.stringify({ title: title.value, body: body.value, format: format.value }) === signature) { title.value = ''; body.value = ''; pending = undefined; }
            offset.value = 0;
            await refresh();
          }); } }, [
            h('label', ['标题（可选）', h('input', { name: 'recordTitle', maxlength: 200, value: title.value, onInput: (e: Event) => { title.value = (e.target as HTMLInputElement).value; } })]),
            h('label', ['正文格式', h('select', { name: 'recordFormat', value: format.value, onChange: (e: Event) => { format.value = (e.target as HTMLSelectElement).value as BodyFormat; } }, [h('option', { value: 'plain' }, '纯文本'), h('option', { value: 'markdown' }, 'Markdown')])]),
            h('label', ['正文', h('textarea', { name: 'recordBody', rows: 10, maxlength: 200000, value: body.value, placeholder: '写下想保存的内容…', onInput: (e: Event) => { body.value = (e.target as HTMLTextAreaElement).value; } })]),
            h('button', { type: 'submit', 'data-save-record': '', disabled: busy.value || !body.value.trim() }, busy.value ? '正在处理…' : '保存记录'),
            h('p', { class: 'muted' }, 'Markdown 按源码保存与查看；当前输入尚无离线草稿保存。'),
          ]),
        ]),
        h('div', [h('span', { class: 'eyebrow' }, 'LIBRARY'), h('h2', `找回记录 · ${total.value}`),
          h('form', { class: 'search', onSubmit: (e: Event) => { e.preventDefault(); offset.value = 0; void run(refresh); } }, [h('input', { name: 'recordQuery', value: query.value, placeholder: '搜索标题或正文', maxlength: 200, onInput: (e: Event) => { query.value = (e.target as HTMLInputElement).value; } }), h('button', { type: 'submit', 'data-search-record': '', disabled: busy.value }, '查询')]),
          h('div', { class: 'record-list' }, items.value.length ? items.value.map(record => h('button', { class: 'record-item', key: record.id, 'data-record-id': record.id, disabled: busy.value || edit.busy, onClick: () => editor.select(record.id) }, [h('strong', record.title || '无标题记录'), h('span', `${record.format === 'markdown' ? 'Markdown' : '纯文本'} · ${new Date(record.createdAt).toLocaleString()}`)])) : h('p', '暂无匹配记录')),
          h('div', { class: 'actions' }, [h('button', { disabled: busy.value || offset.value === 0, onClick: () => { offset.value = Math.max(0, offset.value - 30); void run(refresh); } }, '上一页'), h('button', { disabled: busy.value || offset.value + 30 >= total.value, onClick: () => { offset.value += 30; void run(refresh); } }, '下一页')]),
          edit.record ? h('article', { class: 'record-detail' }, [
            h('h3', edit.record.title || '无标题记录'),
            h('p', { class: 'muted', 'data-record-revision': '' }, `后端版本 ${edit.record.revision} · ${edit.record.format === 'markdown' ? 'Markdown 源文' : '纯文本'}`),
            !edit.editing ? [h('pre', { 'data-record-body': '' }, edit.record.body), h('button', { 'data-edit-record': '', disabled: busy.value || edit.busy, onClick: () => editor.begin() }, '编辑记录')] : [
              h('form', { 'data-editor': '', onSubmit: (event: Event) => { event.preventDefault(); void run(async () => { if (await editor.save()) await refresh(); }); } }, [
                h('p', { 'data-editor-dirty': '', class: 'muted' }, `${editor.dirty ? '未保存 · 草稿仅在当前窗口内存中' : '与后端基线一致'} · 编辑基线版本 ${edit.baseline?.revision}`),
                h('fieldset', { disabled: edit.busy || busy.value }, [
                  h('label', ['编辑标题（可选）', h('input', { name: 'editTitle', maxlength: 200, value: edit.draft.title, onInput: (event: Event) => editor.change({ title: (event.target as HTMLInputElement).value }) })]),
                  h('label', ['编辑格式', h('select', { name: 'editFormat', value: edit.draft.format, onChange: (event: Event) => editor.change({ format: (event.target as HTMLSelectElement).value as BodyFormat }) }, [h('option', { value: 'plain' }, '纯文本'), h('option', { value: 'markdown' }, 'Markdown')])]),
                  h('label', ['编辑正文（源文）', h('textarea', { name: 'editBody', rows: 10, maxlength: 200000, value: edit.draft.body, onInput: (event: Event) => editor.change({ body: (event.target as HTMLTextAreaElement).value }) })]),
                ]),
                h('div', { class: 'actions' }, [
                  h('button', { type: 'submit', 'data-save-edit': '', disabled: busy.value || edit.busy || !editor.dirty || !edit.draft.body.trim() }, edit.busy ? '正在处理…' : '保存修改'),
                  h('button', { type: 'button', 'data-cancel-edit': '', disabled: busy.value || edit.busy, onClick: () => editor.cancel() }, '结束编辑'),
                ]),
              ]),
              h('div', { class: 'actions' }, [
                h('button', { 'data-latest-record': '', disabled: busy.value || edit.busy, onClick: () => editor.viewLatest() }, '查看后端最新内容'),
                h('button', { 'data-discard-edit': '', disabled: busy.value || edit.busy, onClick: () => editor.discard() }, '放弃草稿并加载最新记录'),
              ]),
              edit.latest ? h('aside', { class: 'conflict-comparison', 'data-latest': '' }, [
                h('h4', `后端最新内容 · 版本 ${edit.latest.revision}`), h('p', edit.latest.title || '无标题记录'), h('p', edit.latest.format === 'markdown' ? 'Markdown 源文' : '纯文本'),
                h('pre', { 'data-latest-body': '', tabindex: 0 }, edit.latest.body),
                h('p', '你的草稿仍在上方，可选中复制。查看最新不会改变编辑基线；选择以下操作后，请自行整理，再手动保存。'),
                h('div', { class: 'actions' }, [
                  h('button', { 'data-rebase-edit': '', disabled: busy.value || edit.busy, onClick: () => editor.rebase() }, '以此版本为基线整理（保留草稿）'),
                  h('button', { 'data-keep-draft': '', onClick: () => editor.hideLatest() }, '返回草稿，暂不处理'),
                ]),
              ]) : null,
              h('details', [h('summary', `对照编辑基线 · 版本 ${edit.baseline?.revision}`), h('p', edit.baseline?.title), h('pre', edit.baseline?.body)]),
            ],
          ]) : null,
          h('p', { role: edit.conflict ? 'alert' : 'status', 'data-editor-message': '' }, edit.message),
        ]),
      ]), h('p', { role: 'status', 'data-record-message': '' }, message.value),
    ];
  } }) });
}
