import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './identity-schema.js';
import { records } from './records-schema.js';
// SET NULL is the durable cleanup intent when records are emptied without the business provider.
export const attachments = sqliteTable('attachments_objects', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => users.id),
  recordId: text('record_id').references(() => records.id, { onDelete: 'set null' }),
  objectId: text('object_id').notNull().unique(), name: text('name').notNull(), mediaType: text('media_type').notNull(),
  state: text('state', { enum: ['pending', 'ready', 'deleting', 'deleted'] }).notNull(),
  bytes: integer('bytes'), digest: text('digest'), createdAt: integer('created_at').notNull(), error: text('error'),
}, t => [index('attachments_record').on(t.ownerId, t.recordId)]);
