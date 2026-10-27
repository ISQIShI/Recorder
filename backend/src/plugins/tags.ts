import type { Context } from '@deepseek-ai/cordis';
import { failure } from '../domain.js';
import type { TagService } from '../tags-contract.js';
export const inject = ['recorderTagStore', 'recorderCrypto'];
export function apply(ctx: Context) {
  ctx.provide('recorderTags', {
    list(principal) { return { items: ctx.recorderTagStore.list(principal.userId) }; },
    create(principal, input) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name || name.length > 64) throw failure(400, 'INVALID_TAG', '标签名去除首尾空白后须为 1–64 个字符');
      return ctx.recorderTagStore.create(principal.userId, name, ctx.recorderCrypto.id(), Date.now());
    },
    recordTags(principal, input) { return { items: ctx.recorderTagStore.recordTags(principal.userId, input.id) }; },
    associate(principal, input, add) { ctx.recorderTagStore.associate(principal.userId, input.id, input.tagId, add); return { ok: true }; },
    records(principal, input) {
      if ((input.q !== undefined && (typeof input.q !== 'string' || input.q.length > 200))
        || !Number.isSafeInteger(input.limit ?? 30) || (input.limit ?? 30) < 1 || (input.limit ?? 30) > 100
        || !Number.isSafeInteger(input.offset ?? 0) || (input.offset ?? 0) < 0 || (input.offset ?? 0) > 1000000) throw failure(400, 'INVALID_INPUT', '筛选参数不正确');
      return ctx.recorderTagStore.records(principal.userId, input.id, input.q ?? '', input.limit ?? 30, input.offset ?? 0);
    },
  } satisfies TagService);
}
