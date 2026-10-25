import { sqliteTable, integer } from 'drizzle-orm/sqlite-core';
// Isolated engineering fixture. This is not the production record schema.
export const probe = sqliteTable('validation_probe', {
  id: integer('id').primaryKey(),
  value: integer('value').notNull(),
});
