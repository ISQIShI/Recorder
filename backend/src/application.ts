import { resolve, join } from 'node:path';
import { createBackend } from './bootstrap.js';
import type { ApiHttpConfig } from './plugins/api-http.js';
import { installedMigrations } from './data/migration-manifest.js';
import { MigrationError } from './domain.js';
export interface ApplicationOptions { dataDir?: string; filename?: string; setupCode?: string; http?: ApiHttpConfig; attachments?: { maxBytes?: number } }
export async function createApplication(options: ApplicationOptions = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.RECORDER_DATA_DIR ?? '../.recorder');
  const filename = options.filename ?? join(dataDir, 'recorder.sqlite');
  try { return await createBackend({ entries: [
    { id: 'database-ownership', name: './plugins/database-ownership.js', config: { filename } },
    { id: 'database', name: './plugins/database.js', config: { filename } },
    { id: 'maintenance-runs', name: './plugins/maintenance-runs.js' },
    { id: 'crypto', name: './plugins/crypto.js' },
    // Business startup never loads the low-level upgrade executor. Existing databases must already match.
    { id: 'migrations', name: './plugins/migrations.js', inject: ['recorderMaintenanceRuns'], config: { sources: installedMigrations, mode: 'startup', maintenanceGuard: true } },
    { id: 'identity-store', name: './plugins/identity-store.js' },
    { id: 'auth', name: './plugins/auth.js', config: { ...(options.setupCode ? { setupCode: options.setupCode } : { setupFile: join(dataDir, 'setup-code.txt') }) } },
    { id: 'record-store', name: './plugins/record-store.js' },
    { id: 'managed-files', name: './plugins/managed-files.js', config: options.attachments ?? {} },
    { id: 'attachments', name: './plugins/attachments.js' },
    { id: 'records', name: './plugins/records.js' },
    { id: 'tag-store', name: './plugins/tag-store.js' },
    { id: 'tags', name: './plugins/tags.js' },
    { id: 'category-store', name: './plugins/category-store.js' },
    { id: 'categories', name: './plugins/categories.js' },
    { id: 'api-operations', name: './plugins/api-operations.js' },
    { id: 'auth-api', name: './plugins/auth-api.js' },
    { id: 'records-api', name: './plugins/records-api.js' },
    { id: 'tags-api', name: './plugins/tags-api.js' },
    { id: 'categories-api', name: './plugins/categories-api.js' },
    { id: 'attachments-api', name: './plugins/attachments-api.js' },
    { id: 'attachments-http', name: './plugins/attachments-http.js' },
    { id: 'http', name: './plugins/api-http.js', config: options.http ?? {} },
  ] }); }
  catch (error) {
    // A database provider can fail before the migration gate exists; preserve a recognizable startup reason.
    if (/^SQLITE_/.test((error as { code?: string })?.code ?? '')) throw MigrationError.fromDatabase(error);
    throw error;
  }
}
