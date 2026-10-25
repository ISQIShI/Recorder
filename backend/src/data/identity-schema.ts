import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const instances = sqliteTable('core_instance', { id: text('id').primaryKey(), slot: integer('slot').notNull().unique() });
export const users = sqliteTable('identity_users', {
  id: text('id').primaryKey(), username: text('username').notNull().unique(), passwordHash: text('password_hash').notNull(),
  ownerSlot: integer('owner_slot').notNull().unique(), createdAt: integer('created_at').notNull(),
});
export const sessions = sqliteTable('identity_sessions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(), channel: text('channel', { enum: ['web', 'native'] }).notNull(),
  clientName: text('client_name').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(), revokedAt: integer('revoked_at'),
}, table => [index('identity_sessions_user').on(table.userId)]);
