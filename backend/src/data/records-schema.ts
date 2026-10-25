import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './identity-schema.js';
export const records = sqliteTable('records_entries', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => users.id), requestId: text('request_id').notNull(),
  requestHash: text('request_hash').notNull(), title: text('title').notNull(), body: text('body').notNull(),
  format: text('format', { enum: ['plain', 'markdown'] }).notNull(), formatVersion: integer('format_version').notNull(),
  revision: integer('revision').notNull(), originInstanceId: text('origin_instance_id').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [uniqueIndex('records_request').on(table.ownerId, table.requestId), index('records_owner_time').on(table.ownerId, table.createdAt, table.id)]);
