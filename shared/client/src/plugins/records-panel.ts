import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h, ref, watch, onBeforeUnmount } from 'vue';
import type { BodyFormat, RecordData, RecordState } from '@recorder/contracts';
import './account.js';
import './record-editor.js';
import '../services.js';
export const inject = ['recorderPanels', 'recorderAccount', 'recorderApi', 'recorderEditor'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'records', component: defineComponent({ setup() {
    const title = ref(''), body = ref(''), format = ref<BodyFormat>('plain'), query = ref(''), message = ref(''), busy = ref(false);
    const items = ref<RecordData[]>([]), total = ref(0), offset = ref(0);
    const view = ref<RecordState>('active'), clearing = ref(false);
    const editor = ctx.recorderEditor, edit = editor.state;
    let active = true, request = 0, pending: { signature: string; id: string } | undefined;
    const account = ctx.recorderAccount;
    async function refresh() {
      const generation = ++request, session = account.state.identity?.sessionId;
      if (!session) return;
      let result = await ctx.recorderApi.request('listRecords', { q: query.value, limit: 30, offset: offset.value, state: view.value });
      if (!active || generation !== request || account.state.identity?.sessionId !== session) return;
      if (!result.items.length && offset.value > 0) {
        offset.value = Math.floor(Math.max(0, result.total - 1) / 30) * 30;
        result = await ctx.recorderApi.request('listRecords', { q: query.value, limit: 30, offset: offset.value, state: view.value });
      }
      if (active && generation === request && account.state.identity?.sessionId === session) { items.value = result.items; total.value = result.total; }
    }
    async function run(action: () => Promise<void>) {
      if (busy.value) return;
      busy.value = true; message.value = '';
      const session = account.state.identity?.sessionId;
      try { await action(); } catch (error) { if (active && session === account.state.identity?.sessionId) message.value = account.error(error); }
      finally { if (active && session === account.state.identity?.sessionId) busy.value = false; }
    }
    function navigate(state: RecordState, page = 0) {
      if (busy.value || !editor.leave()) return;
      if (view.value !== state) query.value = '';
      view.value = state; offset.value = page; clearing.value = false;
      void run(refresh);
    }
    async function transition(method: 'trashRecord' | 'restoreRecord') {
      const result = await editor.transition(method);
      if (result) {
        editor.leave(); message.value = method === 'trashRecord' ? '已移入回收站，可在回收站恢复。' : '已恢复记录。';
        await refresh();
      } else if (edit.conflict) await refresh();
    }
    watch(() => account.state.identity?.sessionId, () => {
      request++; title.value = ''; body.value = ''; items.value = []; query.value = ''; total.value = 0; offset.value = 0; view.value = 'active'; clearing.value = false; pending = undefined; message.value = ''; busy.value = false;
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
            if (!edit.editing) { view.value = 'active'; query.value = ''; await editor.select(record.id); }
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
        h('div', { 'data-record-state': view.value }, [h('span', { class: 'eyebrow' }, 'LIBRARY'), h('h2', `${view.value === 'trash' ? '回收站' : '找回记录'} · ${total.value}`),
          h('div', { class: 'actions' }, [
            h('button', { 'data-open-active': '', disabled: busy.value || edit.busy || view.value === 'active', onClick: () => navigate('active') }, '正常记录'),
            h('button', { 'data-open-trash': '', disabled: busy.value || edit.busy || view.value === 'trash', onClick: () => navigate('trash') }, '回收站'),
            view.value === 'trash' ? h('button', { 'data-empty-trash': '', disabled: busy.value || edit.busy, onClick: () => { clearing.value = true; } }, '清空全部回收站') : null,
          ]),
          clearing.value ? h('div', { role: 'alertdialog', 'aria-label': '确认清空回收站', 'data-empty-confirmation': '', class: 'record-detail' }, [
            h('p', '将永久删除此账号执行时回收站中的全部记录（包括当前搜索未显示的记录），无法恢复。正常记录不受影响；不会擦除备份或介质。'),
            h('div', { class: 'actions' }, [
              h('button', { 'data-cancel-empty': '', disabled: busy.value, onClick: () => { clearing.value = false; } }, '取消'),
              h('button', { 'data-confirm-empty': '', disabled: busy.value, onClick: () => { void run(async () => {
                const session = account.state.identity?.sessionId;
                const result = await ctx.recorderApi.request('emptyTrash', { confirm: true });
                if (!active || session !== account.state.identity?.sessionId) return;
                editor.leave(); clearing.value = false; message.value = `已永久删除 ${result.deleted} 条回收站记录。`;
                await refresh();
              }); } }, '确认永久清空'),
            ]),
          ]) : null,
          view.value === 'trash' ? h('p', { class: 'muted' }, '回收站内容只读，恢复后可以继续编辑；不会自动清空。') : null,
          h('form', { class: 'search', onSubmit: (e: Event) => { e.preventDefault(); navigate(view.value); } }, [h('input', { name: 'recordQuery', value: query.value, placeholder: '搜索标题或正文', maxlength: 200, onInput: (e: Event) => { query.value = (e.target as HTMLInputElement).value; } }), h('button', { type: 'submit', 'data-search-record': '', disabled: busy.value || edit.busy }, '查询')]),
          busy.value ? h('p', { role: 'status' }, '正在加载或处理记录…') : null,
          h('div', { class: 'record-list' }, items.value.length ? items.value.map(record => h('button', { class: 'record-item', key: record.id, 'data-record-id': record.id, disabled: busy.value || edit.busy, onClick: () => editor.select(record.id) }, [h('strong', record.title || '无标题记录'), h('span', `${record.format === 'markdown' ? 'Markdown' : '纯文本'} · ${new Date(record.createdAt).toLocaleString()}`)])) : h('p', view.value === 'trash' ? '回收站暂无匹配记录' : '暂无匹配记录')),
          h('div', { class: 'actions' }, [h('button', { 'data-record-prev': '', disabled: busy.value || edit.busy || offset.value === 0, onClick: () => navigate(view.value, Math.max(0, offset.value - 30)) }, '上一页'), h('button', { 'data-record-next': '', disabled: busy.value || edit.busy || offset.value + 30 >= total.value, onClick: () => navigate(view.value, offset.value + 30) }, '下一页')]),
          edit.record ? h('article', { class: 'record-detail' }, [
            h('h3', edit.record.title || '无标题记录'),
            h('p', { class: 'muted', 'data-record-revision': '' }, `后端版本 ${edit.record.revision} · ${edit.record.format === 'markdown' ? 'Markdown 源文' : '纯文本'}`),
            edit.record.deletedAt !== null ? h('p', { 'data-trash-readonly': '' }, `已移入回收站 · ${new Date(edit.record.deletedAt).toLocaleString()} · 只读；已有草稿可复制保留。`) : null,
            h('button', { [edit.record.deletedAt === null ? 'data-trash-record' : 'data-restore-record']: '', disabled: busy.value || edit.busy, onClick: () => { void run(() => transition(edit.record!.deletedAt === null ? 'trashRecord' : 'restoreRecord')); } }, edit.record.deletedAt === null ? '移入回收站' : '恢复记录'),
            !edit.editing ? [h('pre', { 'data-record-body': '' }, edit.record.body), edit.record.deletedAt === null ? h('button', { 'data-edit-record': '', disabled: busy.value || edit.busy, onClick: () => editor.begin() }, '编辑记录') : null] : [
              h('form', { 'data-editor': '', onSubmit: (event: Event) => { event.preventDefault(); void run(async () => { if (await editor.save()) await refresh(); }); } }, [
                h('p', { 'data-editor-dirty': '', class: 'muted' }, `${editor.dirty ? '未保存 · 草稿仅在当前窗口内存中' : '与后端基线一致'} · 编辑基线版本 ${edit.baseline?.revision}`),
                h('fieldset', { disabled: edit.busy || busy.value }, [
                  h('label', ['编辑标题（可选）', h('input', { name: 'editTitle', maxlength: 200, value: edit.draft.title, onInput: (event: Event) => editor.change({ title: (event.target as HTMLInputElement).value }) })]),
                  h('label', ['编辑格式', h('select', { name: 'editFormat', value: edit.draft.format, onChange: (event: Event) => editor.change({ format: (event.target as HTMLSelectElement).value as BodyFormat }) }, [h('option', { value: 'plain' }, '纯文本'), h('option', { value: 'markdown' }, 'Markdown')])]),
                  h('label', ['编辑正文（源文）', h('textarea', { name: 'editBody', rows: 10, maxlength: 200000, value: edit.draft.body, onInput: (event: Event) => editor.change({ body: (event.target as HTMLTextAreaElement).value }) })]),
                ]),
                h('div', { class: 'actions' }, [
                  h('button', { type: 'submit', 'data-save-edit': '', disabled: busy.value || edit.busy || edit.record.deletedAt !== null || !editor.dirty || !edit.draft.body.trim() }, edit.busy ? '正在处理…' : '保存修改'),
                  h('button', { type: 'button', 'data-cancel-edit': '', disabled: busy.value || edit.busy, onClick: () => editor.cancel() }, '结束编辑'),
                ]),
              ]),
              h('div', { class: 'actions' }, [
                h('button', { 'data-latest-record': '', disabled: busy.value || edit.busy, onClick: () => editor.viewLatest() }, '查看后端最新内容'),
                h('button', { 'data-discard-edit': '', disabled: busy.value || edit.busy, onClick: () => editor.discard() }, '放弃草稿并加载最新记录'),
              ]),
              edit.latest ? h('aside', { class: 'conflict-comparison', 'data-latest': '' }, [
                h('h4', `后端最新内容 · 版本 ${edit.latest.revision}`), h('p', edit.latest.title || '无标题记录'), h('p', edit.latest.format === 'markdown' ? 'Markdown 源文' : '纯文本'),
                edit.latest.deletedAt !== null ? h('p', '最新记录在回收站中，只读。草稿仍保留，不能直接以此版本继续保存。') : null,
                h('pre', { 'data-latest-body': '', tabindex: 0 }, edit.latest.body),
                h('p', '你的草稿仍在上方，可选中复制。查看最新不会改变编辑基线；选择以下操作后，请自行整理，再手动保存。'),
                h('div', { class: 'actions' }, [
                  h('button', { 'data-rebase-edit': '', disabled: busy.value || edit.busy || edit.latest.deletedAt !== null, onClick: () => editor.rebase() }, '以此版本为基线整理（保留草稿）'),
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
