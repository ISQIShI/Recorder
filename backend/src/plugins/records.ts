import type { Context } from '@deepseek-ai/cordis';
import { failure, type RecordService } from '../domain.js';
export const inject = ['recorderRecordStore', 'recorderCrypto'];
export function apply(ctx: Context) {
  ctx.provide('recorderRecords', {
    create(principal, input) {
      if (!['plain', 'markdown'].includes(input.format) || !input.body.trim() || input.body.length > 200000 || input.title.length > 200) throw failure(400, 'INVALID_RECORD', '请输入正文，并检查长度和格式');
      const hash = ctx.recorderCrypto.digest(JSON.stringify([input.title, input.body, input.format]));
      return ctx.recorderRecordStore.create(principal.userId, input, hash, ctx.recorderCrypto.id(), Date.now());
    },
    list(principal, input) { return ctx.recorderRecordStore.list(principal.userId, input.q ?? '', input.limit ?? 30, input.offset ?? 0); },
    get(principal, id) {
      const record = ctx.recorderRecordStore.get(principal.userId, id);
      if (!record) throw failure(404, 'NOT_FOUND', '记录不存在');
      return record;
    },
  } satisfies RecordService);
}
