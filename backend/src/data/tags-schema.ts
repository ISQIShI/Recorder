import { sqliteTable, text, integer, uniqueIndex, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { users } from './identity-schema.js';
import { records } from './records-schema.js';

export const tags = sqliteTable('tags_dictionary', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(), createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('tags_owner_name').on(table.ownerId, table.name)]);
export const recordTags = sqliteTable('tags_record_links', {
  recordId: text('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, table => [primaryKey({ columns: [table.recordId, table.tagId] }), index('tags_link_tag').on(table.tagId, table.recordId)]);
