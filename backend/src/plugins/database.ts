import type { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import '../domain.js';
export function apply(ctx: Context, config: { filename: string }) {
  ctx.effect(() => {
    if (config.filename !== ':memory:') mkdirSync(dirname(config.filename), { recursive: true, mode: 0o700 });
    const raw = new Database(config.filename);
    try {
      raw.pragma('foreign_keys = ON');
      raw.pragma('busy_timeout = 5000');
      raw.pragma('journal_mode = WAL');
      raw.pragma('synchronous = FULL');
      ctx.provide('recorderDatabase', { raw, db: drizzle(raw) });
      return () => raw.close();
    } catch (error) { raw.close(); throw error; }
  });
}
