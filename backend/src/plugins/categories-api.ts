import type { Context } from '@deepseek-ai/cordis';
import '../domain.js';
export const inject = ['recorderApiOperations', 'recorderAuth', 'recorderCategories'];
export function apply(ctx: Context) {
  const register = ctx.recorderApiOperations.register.bind(ctx.recorderApiOperations, ctx);
  register('listCategories', ({ principal }) => ({ body: ctx.recorderCategories.list(principal!) }));
  register('createCategory', ({ principal, input }) => ({ body: ctx.recorderCategories.create(principal!, input) }));
  register('updateCategory', ({ principal, input }) => ({ body: ctx.recorderCategories.update(principal!, input) }));
  register('deleteCategory', ({ principal, input }) => ({ body: ctx.recorderCategories.delete(principal!, input) }));
  register('getRecordCategories', ({ principal, input }) => ({ body: ctx.recorderCategories.recordCategories(principal!, input) }));
  register('addRecordCategory', ({ principal, input }) => ({ body: ctx.recorderCategories.associate(principal!, input, true) }));
  register('removeRecordCategory', ({ principal, input }) => ({ body: ctx.recorderCategories.associate(principal!, input, false) }));
  register('listCategoryRecords', ({ principal, input }) => ({ body: ctx.recorderCategories.records(principal!, input) }));
}
