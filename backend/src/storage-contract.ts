import type Database from 'better-sqlite3';
import type { Migration, MigrationPlan, MigrationLedgerEntry } from './migration-contract.js';

export class StorageError extends Error {
  constructor(public readonly code: 'DATABASE_BUSY' | 'PATH_UNSUPPORTED' | 'OWNERSHIP_LOST' | 'SERVICE_WITHDRAWN' |
    'RECOVERY_FAILED' | 'RECOVERY_INVALID' | 'RECOVERY_CANCELLED' | 'STALE_PLAN' | 'MATERIALS_UNAVAILABLE' | 'PERMISSION_DENIED', message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'StorageError';
  }
}
export interface OwnershipLease { filename: string; assertHeld(): void; release(): void }
export interface DatabaseOwnership {
  filename: string;
  controlFile: string | null;
  assertHeld(): void;
  retain(): OwnershipLease;
}
export interface DatabaseUse { use<T>(operation: (raw: Database.Database) => Promise<T>): Promise<T> }
export interface MigrationCapture { plan: MigrationPlan; installed: Migration[]; retained: Migration[] }
export interface RecoveryMaterial extends Omit<Migration, 'sql'> { file: string; digest: string; role: 'installed' | 'retained' }
export interface RecoveryManifest {
  formatVersion: 1; state: 'sealed'; id: string; createdAt: string;
  source: { filename: string; planDigest: string; materialsDigest: string };
  plan: MigrationPlan; ledger: MigrationLedgerEntry[];
  versions: { recorder: string; node: string; sqlite: string; betterSqlite3: string };
  materials: RecoveryMaterial[];
  snapshot: { file: 'database.sqlite'; digest: string; bytes: number };
  validation: { integrity: 'ok'; foreignKeys: 'ok'; ledger: 'ok'; materials: 'ok' };
  executableArchived: false;
}
export interface RecoveryPoint { id: string; directory: string; manifestDigest: string; manifest: RecoveryManifest }
export interface RecoveryPoints {
  create(expectedPlanDigest: string): Promise<RecoveryPoint>;
  verify(id: string): Promise<RecoveryPoint>;
  list(): Promise<{ valid: RecoveryPoint[]; invalid: { id: string; code: string }[]; incomplete: string[] }>;
}
