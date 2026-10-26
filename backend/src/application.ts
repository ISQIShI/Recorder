import { resolve, join } from 'node:path';
import { createBackend } from './bootstrap.js';
import type { ApiHttpConfig } from './plugins/api-http.js';
import { installedMigrations } from './data/migration-manifest.js';
import { MigrationError } from './domain.js';
export interface ApplicationOptions { dataDir?: string; filename?: string; setupCode?: string; http?: ApiHttpConfig }
export async function createApplication(options: ApplicationOptions = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.RECORDER_DATA_DIR ?? '../.recorder');
  try { return await createBackend({ entries: [
    { id: 'database', name: './plugins/database.js', config: { filename: options.filename ?? join(dataDir, 'recorder.sqlite') } },
    { id: 'crypto', name: './plugins/crypto.js' },
    // Business startup never loads the low-level upgrade executor. Existing databases must already match.
    { id: 'migrations', name: './plugins/migrations.js', config: { sources: installedMigrations, mode: 'startup' } },
    { id: 'identity-store', name: './plugins/identity-store.js' },
    { id: 'auth', name: './plugins/auth.js', config: { ...(options.setupCode ? { setupCode: options.setupCode } : { setupFile: join(dataDir, 'setup-code.txt') }) } },
    { id: 'record-store', name: './plugins/record-store.js' },
    { id: 'records', name: './plugins/records.js' },
    { id: 'api-operations', name: './plugins/api-operations.js' },
    { id: 'auth-api', name: './plugins/auth-api.js' },
    { id: 'records-api', name: './plugins/records-api.js' },
    { id: 'http', name: './plugins/api-http.js', config: options.http ?? {} },
  ] }); }
  catch (error) {
    // A database provider can fail before the migration gate exists; preserve a recognizable startup reason.
    if (/^SQLITE_/.test((error as { code?: string })?.code ?? '')) throw MigrationError.fromDatabase(error);
    throw error;
  }
}
