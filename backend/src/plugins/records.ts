import type { Context } from '@deepseek-ai/cordis';
import type { RecordInput } from '@recorder/contracts';
import { failure, type RecordService } from '../domain.js';
export const inject = ['recorderRecordStore', 'recorderCrypto'];
function validate(input: Pick<RecordInput, 'title' | 'body' | 'format'>) {
  if (!['plain', 'markdown'].includes(input.format) || typeof input.body !== 'string' || !input.body.trim()
    || input.body.length > 200000 || typeof input.title !== 'string' || input.title.length > 200) throw failure(400, 'INVALID_RECORD', '请输入正文，并检查长度和格式');
}
function revision(input: { expectedRevision: number }) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw failure(400, 'INVALID_INPUT', '修订号必须是正的安全整数');
}
export function apply(ctx: Context) {
  ctx.provide('recorderRecords', {
    trash(principal, input) { revision(input); return ctx.recorderRecordStore.setState(principal.userId, input, 'trash', Date.now()); },
    restore(principal, input) { revision(input); return ctx.recorderRecordStore.setState(principal.userId, input, 'active', Date.now()); },
    emptyTrash(principal, input) {
      if (input.confirm !== true) throw failure(400, 'CONFIRMATION_REQUIRED', '清空回收站不可恢复，需要明确确认');
      return ctx.recorderRecordStore.emptyTrash(principal.userId);
    },
    update(principal, input) {
      validate(input);
      revision(input);
      return ctx.recorderRecordStore.update(principal.userId, input, Date.now());
    },
    create(principal, input) {
      validate(input);
      const hash = ctx.recorderCrypto.digest(JSON.stringify([input.title, input.body, input.format]));
      return ctx.recorderRecordStore.create(principal.userId, input, hash, ctx.recorderCrypto.id(), Date.now());
    },
    list(principal, input) {
      if (input.state !== undefined && !['active', 'trash'].includes(input.state)) throw failure(400, 'INVALID_INPUT', '记录状态不正确');
      return ctx.recorderRecordStore.list(principal.userId, input.q ?? '', input.limit ?? 30, input.offset ?? 0, input.state);
    },
    get(principal, id) {
      const record = ctx.recorderRecordStore.get(principal.userId, id);
      if (!record) throw failure(404, 'NOT_FOUND', '记录不存在');
      return record;
    },
  } satisfies RecordService);
}
