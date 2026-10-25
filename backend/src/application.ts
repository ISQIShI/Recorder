import { resolve, join } from 'node:path';
import { createBackend } from './bootstrap.js';
import type { ApiHttpConfig } from './plugins/api-http.js';
import { installedMigrations } from './data/migration-manifest.js';
export interface ApplicationOptions { dataDir?: string; filename?: string; setupCode?: string; http?: ApiHttpConfig }
export function createApplication(options: ApplicationOptions = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.RECORDER_DATA_DIR ?? '../.recorder');
  return createBackend({ entries: [
    { id: 'database', name: './plugins/database.js', config: { filename: options.filename ?? join(dataDir, 'recorder.sqlite') } },
    { id: 'crypto', name: './plugins/crypto.js' },
    { id: 'migrations', name: './plugins/migrations.js', config: { sources: installedMigrations } },
    { id: 'identity-store', name: './plugins/identity-store.js' },
    { id: 'auth', name: './plugins/auth.js', config: { ...(options.setupCode ? { setupCode: options.setupCode } : { setupFile: join(dataDir, 'setup-code.txt') }) } },
    { id: 'record-store', name: './plugins/record-store.js' },
    { id: 'records', name: './plugins/records.js' },
    { id: 'api-operations', name: './plugins/api-operations.js' },
    { id: 'auth-api', name: './plugins/auth-api.js' },
    { id: 'records-api', name: './plugins/records-api.js' },
    { id: 'http', name: './plugins/api-http.js', config: options.http ?? {} },
  ] });
}
