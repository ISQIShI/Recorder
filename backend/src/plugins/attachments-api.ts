import type { Context } from '@deepseek-ai/cordis';
import '../attachments-contract.js';
import '../domain.js';
export const inject = ['recorderApiOperations', 'recorderAuth', 'recorderAttachments'];
export function apply(ctx: Context) {
  ctx.recorderApiOperations.register(ctx, 'listAttachments', ({ principal, input }) => ({ body: ctx.recorderAttachments.list(principal!, input.id) }));
  ctx.recorderApiOperations.register(ctx, 'deleteAttachment', async ({ principal, input }) => ({ body: await ctx.recorderAttachments.remove(principal!, input.id, input.confirm) }));
}
