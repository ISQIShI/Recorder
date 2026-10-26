import type { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import { statSync } from 'node:fs';
import { StorageError, type DatabaseOwnership } from '../storage-contract.js';
import { canonicalDatabase, ensureControlFile, regularFile } from './storage-path.js';
import '../domain.js';

/** Owns a separate rollback-mode control database, never a transaction on the business database. */
export function apply(ctx: Context, config: { filename: string }) {
  const filename = config.filename === ':memory:' ? ':memory:' : canonicalDatabase(config.filename);
  const controlFile = filename === ':memory:' ? null : filename + '.recorder-lock.sqlite';
  let control: Database.Database | undefined;
  const identity = controlFile ? ensureControlFile(controlFile) : undefined;
  try {
    if (controlFile) {
      control = new Database(controlFile, { fileMustExist: true, timeout: 0 });
      control.pragma('busy_timeout = 0');
      control.pragma('journal_mode = DELETE');
      control.exec('BEGIN EXCLUSIVE');
      const current = regularFile(controlFile);
      if (current.ino !== identity!.ino || current.dev !== identity!.dev) throw new StorageError('OWNERSHIP_LOST', 'Storage control file was replaced');
    }
  } catch (error) {
    control?.close();
    if (/^SQLITE_(BUSY|LOCKED)/.test((error as { code?: string }).code ?? '')) throw new StorageError('DATABASE_BUSY', 'Another Recorder host owns this database', { cause: error });
    throw error;
  }
  let accepting = true, closed = false, uses = 0, drained: (() => void) | undefined;
  const assertHeld = () => {
    if (closed || (control && (!control.open || !control.inTransaction))) throw new StorageError('OWNERSHIP_LOST', 'Database ownership is no longer held');
    if (controlFile) {
      const current = regularFile(controlFile);
      if (current.ino !== identity!.ino || current.dev !== identity!.dev) throw new StorageError('OWNERSHIP_LOST', 'Storage control file was replaced');
    }
    if (filename !== ':memory:') {
      try { if (statSync(filename).nlink !== 1) throw new StorageError('OWNERSHIP_LOST', 'Database acquired an unsupported hard-link alias'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  };
  ctx.effect(() => async () => {
    accepting = false;
    if (uses) await new Promise<void>(resolve => { drained = resolve; });
    closed = true;
    control?.close(); // Closing rolls back the control transaction; never unlink the control file.
  });
  ctx.provide('recorderDatabaseOwnership', {
    filename, controlFile,
    assertHeld() { if (!accepting) throw new StorageError('SERVICE_WITHDRAWN', 'Ownership provider is withdrawing'); assertHeld(); },
    retain() {
      if (!accepting) throw new StorageError('SERVICE_WITHDRAWN', 'Ownership provider is withdrawing');
      assertHeld(); uses++;
      let released = false;
      return { filename, assertHeld() { if (released) throw new StorageError('OWNERSHIP_LOST', 'Ownership lease was released'); assertHeld(); },
        release() { if (released) return; released = true; if (!--uses) drained?.(); } };
    },
  } satisfies DatabaseOwnership);
}
