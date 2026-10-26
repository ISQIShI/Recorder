/** Backend-only contracts. Package versions never stand in for data revisions. */
export interface MigrationKey { namespace: string; revision: number }
export interface Migration extends MigrationKey {
  requires?: readonly string[];
  dependencies?: readonly MigrationKey[];
  packageVersion?: string;
  sql: string;
}
export interface MigrationSource extends Omit<Migration, 'sql'> { file: string }
export interface MigrationStep extends MigrationKey {
  sql: string; digest: string; dependencies: MigrationKey[]; packageVersion?: string;
}
export interface MigrationLedgerEntry extends MigrationKey { digest: string; appliedAt: number }
export type MigrationFailureCode =
  | 'INVALID_MANIFEST' | 'DUPLICATE_MIGRATION' | 'HISTORY_GAP' | 'MISSING_DEPENDENCY' | 'CYCLIC_DEPENDENCY'
  | 'UNVERIFIED_HISTORY' | 'DIGEST_MISMATCH' | 'VERSION_UNSUPPORTED' | 'UNTRACKED_DATABASE' | 'INVALID_LEDGER'
  | 'SQL_NOT_ALLOWED' | 'DATABASE_CORRUPT' | 'DATABASE_BUSY' | 'DATABASE_UNAVAILABLE' | 'FOREIGN_KEY_FAILED'
  | 'STALE_PLAN' | 'UPGRADE_REQUIRED' | 'STEP_FAILED' | 'TRANSACTION_ACTIVE' | 'SERVICE_WITHDRAWN';
export interface MigrationReason { code: MigrationFailureCode; message: string; step?: MigrationKey }
export interface MigrationPlan {
  formatVersion: 1;
  status: 'empty' | 'compatible' | 'upgrade-required' | 'blocked';
  database: string;
  digest: string;
  materialsDigest: string;
  namespaces: { namespace: string; currentRevision: number; targetRevision: number | null; packageVersion: string | null }[];
  applied: MigrationLedgerEntry[];
  steps: MigrationStep[];
  reasons: MigrationReason[];
}
export interface MigrationPlanner {
  inspect(): MigrationPlan;
  /** Optional, compatible addition: complete SQL materials and plan inspected from the same bytes. */
  capture?(): { plan: MigrationPlan; installed: Migration[]; retained: Migration[] };
}
export interface MigrationExecutionResult { committed: MigrationKey[]; plan: MigrationPlan }
/** Low-level capability for an explicitly assembled maintenance/test profile, never the business profile. */
export interface MigrationExecutor { execute(expectedDigest: string): MigrationExecutionResult }
export class MigrationError extends Error {
  static fromDatabase(error: unknown): MigrationError {
    if (error instanceof MigrationError) return error;
    const code = (error as { code?: string })?.code ?? '';
    if (/^SQLITE_(BUSY|LOCKED)/.test(code)) return new MigrationError('DATABASE_BUSY', 'Database is busy', undefined, undefined, [], { cause: error });
    if (/^SQLITE_(CORRUPT|NOTADB)/.test(code)) return new MigrationError('DATABASE_CORRUPT', 'Database integrity cannot be verified', undefined, undefined, [], { cause: error });
    return new MigrationError('DATABASE_UNAVAILABLE', 'Database cannot be inspected', undefined, undefined, [], { cause: error });
  }
  constructor(public readonly code: MigrationFailureCode, message: string,
    public readonly plan?: MigrationPlan, public readonly step?: MigrationKey,
    public readonly committed: MigrationKey[] = [], options?: ErrorOptions) {
    super(message, options); this.name = 'MigrationError';
  }
}
