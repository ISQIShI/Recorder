import type { Context } from '@deepseek-ai/cordis';
import '../domain.js';
import '../tags-contract.js';
export const inject = ['recorderApiOperations', 'recorderAuth', 'recorderTags'];
export function apply(ctx: Context) {
  const register = ctx.recorderApiOperations.register.bind(ctx.recorderApiOperations, ctx);
  register('listTags', ({ principal }) => ({ body: ctx.recorderTags.list(principal!) }));
  register('createTag', ({ principal, input }) => ({ body: ctx.recorderTags.create(principal!, input) }));
  register('getRecordTags', ({ principal, input }) => ({ body: ctx.recorderTags.recordTags(principal!, input) }));
  register('addRecordTag', ({ principal, input }) => ({ body: ctx.recorderTags.associate(principal!, input, true) }));
  register('removeRecordTag', ({ principal, input }) => ({ body: ctx.recorderTags.associate(principal!, input, false) }));
  register('listTagRecords', ({ principal, input }) => ({ body: ctx.recorderTags.records(principal!, input) }));
}
