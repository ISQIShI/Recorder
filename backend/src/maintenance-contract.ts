import type { MigrationLedgerEntry, MigrationPlan } from './migration-contract.js';
import type { RecoveryPoint } from './storage-contract.js';

export class MaintenanceError extends Error {
  constructor(public readonly code: 'CONFIRMATION_REQUIRED' | 'STALE_PLAN' | 'MAINTENANCE_BUSY' | 'MAINTENANCE_INCOMPLETE' |
    'RUN_INVALID' | 'MANUAL_INTERVENTION' | 'SERVICE_WITHDRAWN' | 'TARGET_UNSAFE' | 'ISOLATED_RECOVERY' |
    'RESTORE_INVALID' | 'SPACE_REQUIRED' | 'MAINTENANCE_UNAVAILABLE', message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'MaintenanceError';
  }
}
export interface MaintenanceRun {
  formatVersion: 1; id: string; source: string; createdAt: string; updatedAt: string;
  phase: 'snapshot' | 'executing' | 'validating' | 'complete';
  original: MigrationPlan; observed: MigrationLedgerEntry[];
  recovery?: { id: string; manifestDigest: string };
}
export interface MaintenanceRuns {
  readonly directory: string;
  read(): { runs: MaintenanceRun[]; pending: string[] };
  write(run: MaintenanceRun): void;
  assertStartup(): void;
}
export interface MaintenanceInspection {
  plan: MigrationPlan;
  run?: MaintenanceRun;
  state: 'idle' | 'snapshot-needed' | 'can-continue' | 'final-validation' | 'manual';
  committed: number;
  pendingFiles: string[];
  reason?: string;
}
export interface MaintenanceCoordinator {
  inspect(): Promise<MaintenanceInspection>;
  upgrade(expectedDigest: string): Promise<MaintenanceInspection>;
  resume(expectedDigest: string): Promise<MaintenanceInspection>;
}
export interface RestoredDatabase {
  formatVersion: 1; state: 'incomplete' | 'isolated'; filename: 'database.sqlite';
  source: string; pointId: string; manifestDigest: string; snapshotDigest: string;
  versions: RecoveryPoint['manifest']['versions'];
}
export interface IsolatedRecovery {
  restore(pointId: string, target: string): Promise<RestoredDatabase>;
  verify(target: string): Promise<RestoredDatabase>;
}
