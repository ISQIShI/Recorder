import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h } from 'vue';
import './record-attachments.js';
import '../services.js';
export const inject = ['recorderPanels', 'recorderRecordAttachments', 'recorderEditor', 'recorderAccount', 'recorderFileTransfer'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'attachments', component: defineComponent({ setup() {
    const model = ctx.recorderRecordAttachments, state = model.state;
    return () => {
      if (!ctx.recorderAccount.state.identity) return null;
      const record = ctx.recorderEditor.state.record, readonly = record?.deletedAt !== null, busy = state.busy || ctx.recorderEditor.state.busy;
      return [h('h2', '托管附件'), !record ? h('p', '先保存或选择已有记录，再添加附件。') : h('div', { 'data-record-attachments': record.id }, [
        h('p', readonly ? '回收站附件只读，可以另存为；恢复后可添加或删除。' : '文件复制到后端，原文件保留。单文件上限 1 GiB；文本正文版本不变。'),
        !ctx.recorderFileTransfer.available ? h('p', { 'data-files-unavailable': '' }, '当前客户端尚无文件设备适配，请使用 Windows 桌面上传或另存为。') : null,
        h('button', { 'data-refresh-attachments': '', disabled: busy, onClick: () => model.refresh() }, '刷新附件'),
        state.loading ? h('p', '正在读取附件…') : !state.loaded ? h('p', '附件尚未读取成功，请刷新。') : state.items.length ? h('ul', state.items.map(item => h('li', { key: item.id, 'data-attachment': item.id }, [
          h('span', `${item.name} · ${item.bytes.toLocaleString()} 字节${item.state === 'deleting' ? ' · 等待永久清理，可重试删除' : ''}${item.error ? ' · 文件清理失败' : ''}`),
          h('button', { 'data-save-attachment': item.id, disabled: busy || item.state !== 'ready' || !ctx.recorderFileTransfer.available, onClick: () => model.save(item.id) }, '另存为'),
          !readonly ? h('button', { 'data-delete-attachment': item.id, disabled: busy, onClick: () => model.askDelete(item) }, item.state === 'deleting' ? '重试永久删除' : '永久删除附件') : null,
        ]))) : h('p', '暂无已保存附件。'),
        !readonly && ctx.recorderFileTransfer.available ? h('div', [
          h('button', { 'data-choose-attachment': '', disabled: busy, onClick: () => model.choose() }, '选择文件'),
          state.chosen ? h('p', { 'data-chosen-attachment': '' }, `尚未上传：${state.chosen.name} · ${state.chosen.bytes.toLocaleString()} 字节`) : null,
          h('button', { 'data-upload-attachment': '', disabled: busy || !state.chosen, onClick: () => model.upload() }, '上传到此记录'),
        ]) : null,
        state.busy ? h('div', [state.progress ? h('p', { 'data-file-progress': '' }, `${state.progress.phase === 'upload' ? '上传' : '另存'} ${state.progress.bytes.toLocaleString()} / ${state.progress.total.toLocaleString()} 字节（完成后仍须确认结果）`) : h('p', '正在处理文件…'), h('button', { 'data-cancel-file': '', onClick: () => model.cancel() }, '取消传输')]) : null,
        state.deleting ? h('div', { role: 'alertdialog', 'data-attachment-delete-confirmation': '' }, [h('p', `将永久删除附件「${state.deleting.name}」，无法恢复。原文件和记录保留；已有独立恢复点副本不受影响。`), h('button', { 'data-cancel-attachment-delete': '', disabled: busy, onClick: () => model.cancelDelete() }, '取消'), h('button', { 'data-confirm-attachment-delete': '', disabled: busy, onClick: () => model.confirmDelete() }, '确认永久删除附件')]) : null,
      ]), h('p', { role: 'status', 'data-attachments-message': '' }, state.message)];
    };
  } }) });
}
