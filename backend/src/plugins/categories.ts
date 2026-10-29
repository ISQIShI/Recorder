import type { Context } from '@deepseek-ai/cordis';
import { failure } from '../domain.js';
import type { CategoryService } from '../categories-contract.js';
export const inject = ['recorderCategoryStore', 'recorderCrypto'];
function name(value: unknown) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed.length > 64) throw failure(400, 'INVALID_CATEGORY', '分类名去除首尾空白后须为 1–64 个 UTF-16 代码单元');
  return trimmed;
}
function expected(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw failure(400, 'INVALID_INPUT', '分类修订号须为正的安全整数'); }
export function apply(ctx: Context) {
  ctx.provide('recorderCategories', {
    list(principal) { return { items: ctx.recorderCategoryStore.list(principal.userId) }; },
    create(principal, input) { return ctx.recorderCategoryStore.create(principal.userId, { ...input, name: name(input.name) }, ctx.recorderCrypto.id(), Date.now()); },
    update(principal, input) { expected(input.expectedRevision); return ctx.recorderCategoryStore.update(principal.userId, { ...input, name: name(input.name) }, Date.now()); },
    delete(principal, input) {
      if (input.confirm !== true) throw failure(400, 'CONFIRMATION_REQUIRED', '删除分类及全部子分类需要明确确认，所有记录保留');
      expected(input.expectedRevision); return ctx.recorderCategoryStore.delete(principal.userId, input);
    },
    recordCategories(principal, input) { return { items: ctx.recorderCategoryStore.recordCategories(principal.userId, input.id) }; },
    associate(principal, input, add) { ctx.recorderCategoryStore.associate(principal.userId, input, add); return { ok: true }; },
    records(principal, input) {
      if ((input.q !== undefined && (typeof input.q !== 'string' || input.q.length > 200))
        || !Number.isSafeInteger(input.limit ?? 30) || (input.limit ?? 30) < 1 || (input.limit ?? 30) > 100
        || !Number.isSafeInteger(input.offset ?? 0) || (input.offset ?? 0) < 0 || (input.offset ?? 0) > 1000000) throw failure(400, 'INVALID_INPUT', '筛选参数不正确');
      return ctx.recorderCategoryStore.records(principal.userId, input);
    },
  } satisfies CategoryService);
}
