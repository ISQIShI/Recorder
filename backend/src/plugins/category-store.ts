import type { Context } from '@deepseek-ai/cordis';
import { and, eq, ne, isNull, asc, desc, sql } from 'drizzle-orm';
import { categories, recordCategories } from '../data/categories-schema.js';
import { records } from '../data/records-schema.js';
import { recordSelection, exposeRecord } from '../data/record-query.js';
import { failure } from '../domain.js';
import type { CategoryStore } from '../categories-contract.js';
export const inject = ['recorderDatabase', 'recorderMigrations', 'recorderRecordStore'];
export function apply(ctx: Context) {
  const { db } = ctx.recorderDatabase;
  const expose = ({ ownerId: _owner, ...node }: typeof categories.$inferSelect) => node;
  function owned(ownerId: string, id: string) {
    const node = db.select().from(categories).where(and(eq(categories.ownerId, ownerId), eq(categories.id, id))).get();
    if (!node) throw failure(404, 'NOT_FOUND', '分类不存在');
    return node;
  }
  function ownedRecord(ownerId: string, id: string) {
    const record = ctx.recorderRecordStore.get(ownerId, id);
    if (!record) throw failure(404, 'NOT_FOUND', '记录不存在');
    return record;
  }
  function subtree(ownerId: string, id: string) {
    return sql`WITH RECURSIVE subtree(id) AS (
      SELECT id FROM categories_nodes WHERE owner_id = ${ownerId} AND id = ${id}
      UNION SELECT child.id FROM categories_nodes AS child JOIN subtree ON child.parent_id = subtree.id WHERE child.owner_id = ${ownerId}
    ) SELECT id FROM subtree`;
  }
  function location(ownerId: string, parentId: string | null, name: string, except?: string) {
    if (parentId !== null) owned(ownerId, parentId);
    const duplicate = db.select({ id: categories.id }).from(categories).where(and(eq(categories.ownerId, ownerId), eq(categories.name, name),
      parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId), except ? ne(categories.id, except) : undefined)).get();
    if (duplicate) throw failure(409, 'CATEGORY_NAME_CONFLICT', '同一父分类下已有此名称，请修改名称或父分类');
  }
  function revision(node: typeof categories.$inferSelect, expected: number) {
    if (node.revision !== expected) throw failure(409, 'REVISION_CONFLICT', '分类已变化，输入仍保留；请刷新版本后自行确认再提交');
  }
  ctx.provide('recorderCategoryStore', {
    list(ownerId) { return db.select().from(categories).where(eq(categories.ownerId, ownerId)).orderBy(asc(categories.name), asc(categories.id)).all().map(expose); },
    create(ownerId, input, id, now) {
      return db.transaction(tx => {
        location(ownerId, input.parentId, input.name);
        return expose(tx.insert(categories).values({ ...input, id, ownerId, revision: 1, createdAt: now, updatedAt: now }).returning().get()!);
      }, { behavior: 'immediate' });
    },
    update(ownerId, input, now) {
      return db.transaction(tx => {
        revision(owned(ownerId, input.id), input.expectedRevision);
        if (input.parentId !== null) {
          owned(ownerId, input.parentId);
          if (db.get(sql`SELECT id FROM (${subtree(ownerId, input.id)}) WHERE id = ${input.parentId}`)) throw failure(409, 'CATEGORY_CYCLE', '不能移动到自身或自己的子分类');
        }
        location(ownerId, input.parentId, input.name, input.id);
        return expose(tx.update(categories).set({ name: input.name, parentId: input.parentId, revision: sql`${categories.revision} + 1`, updatedAt: now })
          .where(and(eq(categories.ownerId, ownerId), eq(categories.id, input.id), eq(categories.revision, input.expectedRevision))).returning().get()!);
      }, { behavior: 'immediate' });
    },
    delete(ownerId, input) {
      return db.transaction(tx => {
        revision(owned(ownerId, input.id), input.expectedRevision);
        const count = tx.get<{ count: number }>(sql`SELECT count(*) AS count FROM (${subtree(ownerId, input.id)})`)!.count;
        // Cascades delete only nodes and their links, never records or tags.
        tx.delete(categories).where(and(eq(categories.ownerId, ownerId), eq(categories.id, input.id))).run();
        return { deleted: count };
      }, { behavior: 'immediate' });
    },
    recordCategories(ownerId, id) {
      ownedRecord(ownerId, id);
      return db.select({ node: categories }).from(recordCategories).innerJoin(categories, eq(categories.id, recordCategories.categoryId))
        .where(and(eq(recordCategories.recordId, id), eq(categories.ownerId, ownerId))).orderBy(asc(categories.name), asc(categories.id)).all().map(row => expose(row.node));
    },
    associate(ownerId, input, add) {
      db.transaction(tx => {
        if (ownedRecord(ownerId, input.id).deletedAt !== null) throw failure(409, 'RECORD_TRASHED', '回收站记录的分类只读，请先恢复记录');
        owned(ownerId, input.categoryId);
        if (add) tx.insert(recordCategories).values({ recordId: input.id, categoryId: input.categoryId }).onConflictDoNothing().run();
        else tx.delete(recordCategories).where(and(eq(recordCategories.recordId, input.id), eq(recordCategories.categoryId, input.categoryId))).run();
      }, { behavior: 'immediate' });
    },
    records(ownerId, input) {
      owned(ownerId, input.id);
      const where = and(recordSelection(ownerId, input.q ?? ''), sql`exists (SELECT 1 FROM ${recordCategories} WHERE ${recordCategories.recordId} = ${records.id} AND ${recordCategories.categoryId} IN (${subtree(ownerId, input.id)}))`);
      const items = db.select().from(records).where(where).orderBy(desc(records.createdAt), desc(records.id)).limit(input.limit ?? 30).offset(input.offset ?? 0).all().map(exposeRecord);
      const total = db.select({ count: sql<number>`count(*)` }).from(records).where(where).get()!.count;
      return { items, total };
    },
  } satisfies CategoryStore);
}
