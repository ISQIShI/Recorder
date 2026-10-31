import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h } from 'vue';
import './file-records.js';
import '../services.js';
export const inject = ['recorderPanels', 'recorderFileRecords', 'recorderFileTransfer', 'recorderAccount', 'recorderEditor'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'file-records', component: defineComponent({ setup() {
    const model = ctx.recorderFileRecords, state = model.state;
    return () => !ctx.recorderAccount.state.identity ? null : [
      h('h2', '从文件新建记录'),
      h('p', '选择一个文件，上传完成后同时保存无正文记录与附件。标题初始使用文件名，原文件保留。'),
      !ctx.recorderFileTransfer.available ? h('p', { 'data-file-record-unavailable': '' }, '当前客户端尚无文件设备适配，请使用 Windows 桌面。') : h('div', [
        h('button', { 'data-choose-file-record': '', disabled: state.busy || ctx.recorderEditor.state.busy, onClick: () => model.choose() }, '选择文件新建记录'),
        state.chosen ? h('p', { 'data-file-record-chosen': '' }, `尚未新建：${state.chosen.name} · ${state.chosen.bytes.toLocaleString()} 字节`) : null,
        h('button', { 'data-create-file-record': '', disabled: state.busy || !state.chosen || ctx.recorderEditor.state.busy, onClick: () => model.create() }, '上传并新建记录'),
      ]),
      state.busy ? h('div', [h('p', { 'data-file-record-progress': '' }, state.progress ? `上传 ${state.progress.bytes.toLocaleString()} / ${state.progress.total.toLocaleString()} 字节（等待后端确认）` : '正在处理文件…'), h('button', { 'data-cancel-file-record': '', onClick: () => model.cancel() }, '取消传输')]) : null,
      state.created ? h('button', { 'data-open-file-record': state.created.id, disabled: state.busy || ctx.recorderEditor.state.busy, onClick: () => model.open() }, '查看新记录') : null,
      h('p', { role: 'status', 'data-file-record-message': '' }, state.message),
    ];
  } }) });
}
