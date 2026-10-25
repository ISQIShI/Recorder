import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h, ref, watch, onBeforeUnmount } from 'vue';
import type { BodyFormat, RecordData } from '@recorder/contracts';
import './account.js';
import '../services.js';
export const inject = ['recorderPanels', 'recorderAccount', 'recorderApi'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'records', component: defineComponent({ setup() {
    const title = ref(''), body = ref(''), format = ref<BodyFormat>('plain'), query = ref(''), message = ref(''), busy = ref(false);
    const items = ref<RecordData[]>([]), selected = ref<RecordData>(), total = ref(0), offset = ref(0);
    let active = true, request = 0, pending: { signature: string; id: string } | undefined;
    const account = ctx.recorderAccount;
    async function refresh() {
      const generation = ++request, session = account.state.identity?.sessionId;
      if (!session) return;
      const result = await ctx.recorderApi.request('listRecords', { q: query.value, limit: 30, offset: offset.value });
      if (active && generation === request && account.state.identity?.sessionId === session) { items.value = result.items; total.value = result.total; }
    }
    async function run(action: () => Promise<void>) {
      busy.value = true; message.value = '';
      const session = account.state.identity?.sessionId;
      try { await action(); } catch (error) { if (active && session === account.state.identity?.sessionId) message.value = account.error(error); }
      finally { if (active) busy.value = false; }
    }
    watch(() => account.state.identity?.sessionId, () => {
      request++; title.value = ''; body.value = ''; items.value = []; selected.value = undefined; query.value = ''; total.value = 0; offset.value = 0; pending = undefined; message.value = '';
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
            message.value = '已保存到后端'; selected.value = record;
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
          h('div', { class: 'record-list' }, items.value.length ? items.value.map(record => h('button', { class: 'record-item', key: record.id, 'data-record-id': record.id, onClick: () => run(async () => {
            const session = account.state.identity?.sessionId;
            const result = await ctx.recorderApi.request('getRecord', { id: record.id });
            if (active && session === account.state.identity?.sessionId) selected.value = result;
          }) }, [h('strong', record.title || '无标题记录'), h('span', `${record.format === 'markdown' ? 'Markdown' : '纯文本'} · ${new Date(record.createdAt).toLocaleString()}`)])) : h('p', '暂无匹配记录')),
          h('div', { class: 'actions' }, [h('button', { disabled: busy.value || offset.value === 0, onClick: () => { offset.value = Math.max(0, offset.value - 30); void run(refresh); } }, '上一页'), h('button', { disabled: busy.value || offset.value + 30 >= total.value, onClick: () => { offset.value += 30; void run(refresh); } }, '下一页')]),
          selected.value ? h('article', { class: 'record-detail' }, [h('h3', selected.value.title || '无标题记录'), h('pre', { 'data-record-body': '' }, selected.value.body)]) : null,
        ]),
      ]), h('p', { role: 'status', 'data-record-message': '' }, message.value),
    ];
  } }) });
}
