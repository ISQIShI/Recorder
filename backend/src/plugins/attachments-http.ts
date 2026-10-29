import type { Context } from '@deepseek-ai/cordis';
import '../domain.js';
export const inject = ['recorderApiOperations', 'recorderAuth', 'recorderAttachments'];
export function apply(ctx: Context) {
  ctx.recorderApiOperations.registerFile(ctx, 'uploadAttachment', call => ctx.recorderAttachments.upload(call));
  ctx.recorderApiOperations.registerFile(ctx, 'downloadAttachment', call => ctx.recorderAttachments.download(call));
}
