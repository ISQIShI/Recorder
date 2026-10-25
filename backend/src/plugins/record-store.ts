import type { Context } from '@deepseek-ai/cordis';
import { and, eq, desc, sql } from 'drizzle-orm';
import type { RecordData } from '@recorder/contracts';
import { records } from '../data/records-schema.js';
import { failure, type RecordStore } from '../domain.js';
export const inject = ['recorderDatabase', 'recorderMigrations', 'recorderIdentityStore'];
function expose(row: typeof records.$inferSelect): RecordData {
  const { ownerId: _owner, requestHash: _hash, ...record } = row;
  return record;
}
export function apply(ctx: Context) {
  const { db } = ctx.recorderDatabase;
  const instanceId = ctx.recorderIdentityStore.instanceId;
  ctx.provide('recorderRecordStore', {
    instanceId,
    update(ownerId, input, now) {
      return db.transaction(tx => {
        const owned = and(eq(records.ownerId, ownerId), eq(records.id, input.id));
        const previous = tx.select().from(records).where(owned).get();
        if (!previous) throw failure(404, 'NOT_FOUND', '记录不存在');
        const row = tx.update(records).set({ title: input.title, body: input.body, format: input.format,
          revision: sql`${records.revision} + 1`, updatedAt: now })
          .where(and(owned, eq(records.revision, input.expectedRevision))).returning().get();
        if (!row) throw failure(409, 'REVISION_CONFLICT', '记录已被修改，请获取最新版本并保留自己的草稿');
        return expose(row);
      }, { behavior: 'immediate' });
    },
    create(ownerId, input, hash, id, now) {
      return db.transaction(tx => {
        const previous = tx.select().from(records).where(and(eq(records.ownerId, ownerId), eq(records.requestId, input.requestId))).get();
        if (previous) {
          if (previous.requestHash !== hash) throw failure(409, 'IDEMPOTENCY_CONFLICT', '该保存请求已用于不同内容，请重新发起保存');
          return expose(previous);
        }
        const row = { ...input, id, ownerId, requestHash: hash, revision: 1, formatVersion: 1, originInstanceId: instanceId, createdAt: now, updatedAt: now };
        tx.insert(records).values(row).run();
        return expose(row);
      }, { behavior: 'immediate' });
    },
    list(ownerId, q, limit, offset) {
      const where = and(eq(records.ownerId, ownerId), q ? sql`instr(lower(${records.title} || char(10) || ${records.body}), lower(${q})) > 0` : undefined);
      const items = db.select().from(records).where(where).orderBy(desc(records.createdAt), desc(records.id)).limit(limit).offset(offset).all().map(expose);
      const total = db.select({ count: sql<number>`count(*)` }).from(records).where(where).get()!.count;
      return { items, total };
    },
    get(ownerId, id) {
      const row = db.select().from(records).where(and(eq(records.ownerId, ownerId), eq(records.id, id))).get();
      return row && expose(row);
    },
  } satisfies RecordStore);
}
