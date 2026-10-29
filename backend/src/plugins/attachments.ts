import type { Context } from '@deepseek-ai/cordis';
import { failure, type Principal } from '../domain.js';
import type { AttachmentService } from '../attachments-contract.js';
export const inject = ['recorderManagedFiles', 'recorderRecordStore', 'recorderMigrations'];
export function apply(ctx: Context) {
  const controller = new AbortController();
  ctx.effect(() => () => controller.abort());
  function owned(principal: Principal, id: string, write = false) {
    controller.signal.throwIfAborted();
    const record = ctx.recorderRecordStore.get(principal.userId, id);
    if (!record) throw failure(404, 'NOT_FOUND', '记录不存在');
    if (write && record.deletedAt !== null) throw failure(409, 'RECORD_TRASHED', '回收站附件只读，请先恢复记录');
  }
  const files = ctx.recorderManagedFiles;
  ctx.effect(() => { void files.cleanup().catch(() => {}); const timer = setInterval(() => { void files.cleanup().catch(() => {}); }, 1000); timer.unref(); return () => clearInterval(timer); });
  ctx.provide('recorderAttachments', {
    list(principal, id) { owned(principal, id); return { items: files.list(principal.userId, id) }; },
    async remove(principal, id, confirm) {
      if (confirm !== true) throw failure(400, 'CONFIRMATION_REQUIRED', '附件将永久删除，需明确确认；原文件保留');
      return files.remove(principal.userId, id, () => { const recordId = files.recordId(principal.userId, id); if (!recordId) throw failure(404, 'NOT_FOUND', '记录不存在'); owned(principal, recordId, true); });
    },
    async upload(call) {
      const principal = call.authenticate(); owned(principal, call.id, true);
      const name = call.name ?? '', mediaType = call.mediaType ?? 'application/octet-stream';
      if (!name || name.length > 255 || /[\\/\x00-\x1f\x7f]/.test(name) || ['.', '..'].includes(name) || !/^[\w.+-]+\/[\w.+-]+$/.test(mediaType) || mediaType.length > 100) throw failure(400, 'INVALID_FILE', '文件名称或类型不正确');
      const body = await files.receive({ owner: principal.userId, recordId: call.id, id: call.uploadId!, name, mediaType }, call.stream, () => { call.authenticate(); owned(principal, call.id, true); }, AbortSignal.any([call.signal, controller.signal]));
      return { body };
    },
    async download(call) {
      const principal = call.authenticate(), attachment = files.get(principal.userId, call.id); owned(principal, attachment.recordId);
      const signal = AbortSignal.any([controller.signal, call.signal]); signal.throwIfAborted();
      const stream = files.download(principal.userId, call.id), abort = () => { stream.destroy(); };
      signal.addEventListener('abort', abort, { once: true }); stream.once('close', () => signal.removeEventListener('abort', abort));
      return { attachment, stream };
    },
  } satisfies AttachmentService);
}
