import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex, primaryKey, index, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { users } from './identity-schema.js';
import { records } from './records-schema.js';
export const categories = sqliteTable('categories_nodes', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => users.id),
  parentId: text('parent_id').references((): AnySQLiteColumn => categories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [uniqueIndex('categories_owner_parent_name').on(table.ownerId, table.parentId, table.name),
  uniqueIndex('categories_owner_root_name').on(table.ownerId, table.name).where(sql`${table.parentId} is null`)]);
export const recordCategories = sqliteTable('categories_record_links', {
  recordId: text('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, table => [primaryKey({ columns: [table.recordId, table.categoryId] }), index('categories_link_category').on(table.categoryId, table.recordId)]);
