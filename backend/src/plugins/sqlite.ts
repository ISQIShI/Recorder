import type { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { probe } from '../validation/schema.js';
import type { ValidationStorage } from '../contracts.js';

export interface SqliteConfig { filename?: string }
export function apply(ctx: Context, config: SqliteConfig = {}) {
  ctx.effect(() => {
    const connection = new Database(config.filename ?? ':memory:');
    try {
      connection.pragma('foreign_keys = ON');
      connection.exec('CREATE TABLE IF NOT EXISTS validation_probe (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
      const database = drizzle(connection);
      database.insert(probe).values({ id: 1, value: 0 }).onConflictDoNothing().run();
      const storage: ValidationStorage = {
        provider: 'sqlite',
        read: () => database.select().from(probe).get()!.value,
        write: (value) => {
          if (!Number.isSafeInteger(value)) throw new Error('Expected safe integer');
          database.update(probe).set({ value }).run();
        },
      };
      ctx.provide('recorderStorage', storage);
      return () => connection.close();
    } catch (error) { connection.close(); throw error; }
  });
}
