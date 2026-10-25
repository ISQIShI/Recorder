import type { MigrationSource } from '../plugins/migrations.js';
// Trusted installed-plugin metadata, assembled before activating repositories.
export const installedMigrations: MigrationSource[] = [
  { namespace: 'identity', revision: 1, requires: [], file: 'identity/0000_initial.sql' },
  { namespace: 'records', revision: 1, requires: ['identity'], file: 'records/0000_initial.sql' },
];
