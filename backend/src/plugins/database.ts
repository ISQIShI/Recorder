import type { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { StorageError } from '../storage-contract.js';
import { canonicalDatabase } from './storage-path.js';
import '../domain.js';
export const inject = ['recorderDatabaseOwnership'];
export function apply(ctx: Context, config: { filename: string }) {
  ctx.effect(() => {
    const ownership = ctx.recorderDatabaseOwnership;
    const requested = config.filename === ':memory:' ? ':memory:' : canonicalDatabase(config.filename);
    if (requested !== ownership.filename) throw new StorageError('PATH_UNSUPPORTED', 'Database provider and ownership target differ');
    const lease = ownership.retain();
    let raw: Database.Database;
    try { raw = new Database(lease.filename); } catch (error) { lease.release(); throw error; }
    let accepting = true;
    const pending = new Set<Promise<unknown>>();
    try {
      raw.pragma('foreign_keys = ON');
      raw.pragma('busy_timeout = 5000');
      raw.pragma('journal_mode = WAL');
      raw.pragma('synchronous = FULL');
      ctx.provide('recorderDatabase', { raw, db: drizzle(raw), use<T>(operation: (raw: Database.Database) => Promise<T>): Promise<T> {
        if (!accepting) return Promise.reject(new StorageError('SERVICE_WITHDRAWN', 'Database provider is withdrawing'));
        lease.assertHeld();
        const task = Promise.resolve().then(() => { lease.assertHeld(); return operation(raw); });
        pending.add(task);
        void task.finally(() => pending.delete(task)).catch(() => {});
        return task;
      } });
      return async () => {
        accepting = false;
        await Promise.allSettled([...pending]);
        // Even if dependent plugins withdraw concurrently, their registered asynchronous uses finish first.
        try { raw.close(); } finally { lease.release(); }
      };
    } catch (error) { raw.close(); lease.release(); throw error; }
  });
}
