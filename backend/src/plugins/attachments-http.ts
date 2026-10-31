import type { Context } from '@deepseek-ai/cordis';
import '../domain.js';
export const inject = ['recorderApiOperations', 'recorderAuth', 'recorderAttachments'];
export function apply(ctx: Context) {
  const controller = new AbortController();
  ctx.effect(() => () => controller.abort());
  ctx.recorderApiOperations.registerFile(ctx, 'uploadAttachment', call => ctx.recorderAttachments.upload({ ...call, signal: AbortSignal.any([call.signal, controller.signal]) }));
  ctx.recorderApiOperations.registerFile(ctx, 'createFileRecord', call => ctx.recorderAttachments.createRecord({ ...call, signal: AbortSignal.any([call.signal, controller.signal]) }));
  ctx.recorderApiOperations.registerFile(ctx, 'downloadAttachment', call => ctx.recorderAttachments.download({ ...call, signal: AbortSignal.any([call.signal, controller.signal]) }));
}
