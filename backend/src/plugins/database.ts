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
    let closing: Promise<void> | undefined;
    function close(): Promise<void> {
      accepting = false;
      if (closing) return closing;
      const task = Promise.allSettled([...pending]).then(() => {
        try {
          if (raw.open) raw.close();
          if (raw.open) throw new Error('SQLite connection is still open');
        } catch (cause) {
          // A live iterator can make better-sqlite3 refuse close. Never unlock a live connection.
          throw new StorageError('DATABASE_CLOSE_FAILED', 'SQLite close failed; database ownership is retained. End outstanding iterators and retry recorderDatabase.close(), or stop the host.', { cause });
        }
        lease.release();
      });
      closing = task;
      void task.catch(() => { if (closing === task) closing = undefined; });
      return task;
    }
    try {
      raw.pragma('foreign_keys = ON');
      raw.pragma('busy_timeout = 5000');
      raw.pragma('journal_mode = WAL');
      raw.pragma('synchronous = FULL');
      ctx.provide('recorderDatabase', { raw, db: drizzle(raw), close, use<T>(operation: (raw: Database.Database) => Promise<T>): Promise<T> {
        if (!accepting) return Promise.reject(new StorageError('SERVICE_WITHDRAWN', 'Database provider is withdrawing'));
        lease.assertHeld();
        const task = Promise.resolve().then(() => { lease.assertHeld(); return operation(raw); });
        pending.add(task);
        void task.finally(() => pending.delete(task)).catch(() => {});
        return task;
      } });
      return close;
    } catch (error) {
      // Activation failure follows the same fail-closed rule as normal withdrawal.
      accepting = false;
      try { if (raw.open) raw.close(); }
      catch (cause) { throw new StorageError('DATABASE_CLOSE_FAILED', 'SQLite activation cleanup failed; database ownership is retained until the host stops', { cause }); }
      if (!raw.open) lease.release();
      throw error;
    }
  });
}
