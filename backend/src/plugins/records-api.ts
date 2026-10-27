import type { Context } from '@deepseek-ai/cordis';
import '../domain.js';
export const inject = ['recorderApiOperations', 'recorderAuth', 'recorderRecords'];
export function apply(ctx: Context) {
  const register = ctx.recorderApiOperations.register.bind(ctx.recorderApiOperations, ctx);
  register('createRecord', ({ principal, input }) => ({ body: ctx.recorderRecords.create(principal!, input) }));
  register('listRecords', ({ principal, input }) => ({ body: ctx.recorderRecords.list(principal!, input) }));
  register('getRecord', ({ principal, input }) => ({ body: ctx.recorderRecords.get(principal!, input.id) }));
  register('updateRecord', ({ principal, input }) => ({ body: ctx.recorderRecords.update(principal!, input) }));
  register('trashRecord', ({ principal, input }) => ({ body: ctx.recorderRecords.trash(principal!, input) }));
  register('restoreRecord', ({ principal, input }) => ({ body: ctx.recorderRecords.restore(principal!, input) }));
  register('emptyTrash', ({ principal, input }) => ({ body: ctx.recorderRecords.emptyTrash(principal!, input) }));
}
