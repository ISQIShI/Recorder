import type { Context } from '@deepseek-ai/cordis';
import { and, eq, desc, asc, sql } from 'drizzle-orm';
import { tags, recordTags } from '../data/tags-schema.js';
import { records } from '../data/records-schema.js';
import { exposeRecord, recordSelection } from '../data/record-query.js';
import { failure } from '../domain.js';
import type { TagStore } from '../tags-contract.js';
export const inject = ['recorderDatabase', 'recorderMigrations', 'recorderRecordStore'];
export function apply(ctx: Context) {
  const { db } = ctx.recorderDatabase;
  function ownedTag(ownerId: string, id: string) {
    const tag = db.select().from(tags).where(and(eq(tags.ownerId, ownerId), eq(tags.id, id))).get();
    if (!tag) throw failure(404, 'NOT_FOUND', '标签不存在');
    return tag;
  }
  function ownedRecord(ownerId: string, id: string) {
    // Consume the record ownership contract, never the concrete record provider.
    const record = ctx.recorderRecordStore.get(ownerId, id);
    if (!record) throw failure(404, 'NOT_FOUND', '记录不存在');
    return record;
  }
  const expose = ({ ownerId: _owner, ...tag }: typeof tags.$inferSelect) => tag;
  ctx.provide('recorderTagStore', {
    list(ownerId) { return db.select().from(tags).where(eq(tags.ownerId, ownerId)).orderBy(asc(tags.name), asc(tags.id)).all().map(expose); },
    create(ownerId, name, id, now) {
      return db.transaction(tx => {
        tx.insert(tags).values({ ownerId, name, id, createdAt: now }).onConflictDoNothing({ target: [tags.ownerId, tags.name] }).run();
        return expose(tx.select().from(tags).where(and(eq(tags.ownerId, ownerId), eq(tags.name, name))).get()!);
      }, { behavior: 'immediate' });
    },
    recordTags(ownerId, id) {
      ownedRecord(ownerId, id); // Trash is readable, just as getRecord is.
      return db.select({ tag: tags }).from(recordTags).innerJoin(tags, eq(tags.id, recordTags.tagId))
        .where(and(eq(recordTags.recordId, id), eq(tags.ownerId, ownerId))).orderBy(asc(tags.name), asc(tags.id)).all().map(row => expose(row.tag));
    },
    associate(ownerId, id, tagId, add) {
      db.transaction(tx => {
        const record = ownedRecord(ownerId, id);
        if (record.deletedAt !== null) throw failure(409, 'RECORD_TRASHED', '回收站记录的标签只读，请先恢复记录');
        ownedTag(ownerId, tagId);
        if (add) tx.insert(recordTags).values({ recordId: id, tagId }).onConflictDoNothing().run();
        else tx.delete(recordTags).where(and(eq(recordTags.recordId, id), eq(recordTags.tagId, tagId))).run();
      }, { behavior: 'immediate' });
    },
    records(ownerId, tagId, q, limit, offset) {
      ownedTag(ownerId, tagId);
      const where = and(eq(recordTags.tagId, tagId), recordSelection(ownerId, q));
      const items = db.select({ record: records }).from(records).innerJoin(recordTags, eq(recordTags.recordId, records.id)).where(where)
        .orderBy(desc(records.createdAt), desc(records.id)).limit(limit).offset(offset).all().map(row => exposeRecord(row.record));
      const total = db.select({ count: sql<number>`count(*)` }).from(records).innerJoin(recordTags, eq(recordTags.recordId, records.id)).where(where).get()!.count;
      return { items, total };
    },
  } satisfies TagStore);
}
