import { createBackend } from './bootstrap.js';
import { installedMigrations } from './data/migration-manifest.js';
import type { MigrationSource } from './migration-contract.js';

export interface MaintenanceOptions {
  filename: string; sources?: readonly MigrationSource[]; retainedSources?: readonly MigrationSource[]; recoveryDirectory?: string;
}
/** Minimal Loader assembly: no auth, record repositories, HTTP, desktop or external task execution. */
export function createMaintenance(options: MaintenanceOptions) {
  const filename = options.filename; // Ownership validates URI/device/alias forms before canonicalizing.
  return createBackend({ entries: [
    { id: 'database-ownership', name: './plugins/database-ownership.js', config: { filename } },
    { id: 'database', name: './plugins/database.js', config: { filename } },
    { id: 'maintenance-runs', name: './plugins/maintenance-runs.js' },
    { id: 'migrations', name: './plugins/migrations.js', config: { sources: options.sources ?? installedMigrations, retainedSources: options.retainedSources, mode: 'inspect' } },
    { id: 'migration-executor', name: './plugins/migration-executor.js' },
    { id: 'recovery-points', name: './plugins/recovery-points.js', config: { directory: options.recoveryDirectory } },
    { id: 'maintenance', name: './plugins/maintenance.js' },
    { id: 'isolated-recovery', name: './plugins/isolated-recovery.js' },
  ] });
}
