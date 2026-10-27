import type { MigrationSource } from '../domain.js';
// Trusted installed-plugin metadata, assembled before activating repositories.
export const installedMigrations: MigrationSource[] = [
  { namespace: 'identity', revision: 1, packageVersion: '0.0.0', requires: [], file: 'identity/0000_initial.sql' },
  { namespace: 'records', revision: 1, packageVersion: '0.0.0', requires: ['identity'], file: 'records/0000_initial.sql' },
  { namespace: 'records', revision: 2, packageVersion: '0.0.0', dependencies: [{ namespace: 'identity', revision: 1 }], file: 'records/0001_trash.sql' },
];
