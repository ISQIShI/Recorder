import type Database from 'better-sqlite3';
import { MigrationError, type MigrationExecutionResult, type MigrationKey, type MigrationPlanner } from '../../migration-contract.js';
import { checkForeignKeys, databaseFailure, ledgerSql } from './plan.js';
import { runControlledSql } from './sql.js';

/** Low-level, synchronous step runner. The maintenance coordinator must hold exclusion and a recovery point. */
export function executeMigrations(raw: Database.Database, planner: MigrationPlanner, expectedDigest: string): MigrationExecutionResult {
  const committed: MigrationKey[] = [];
  if (raw.inTransaction) throw new MigrationError('TRANSACTION_ACTIVE', 'Migration execution cannot nest inside another transaction');
  let plan = planner.inspect();
  if (plan.digest !== expectedDigest) throw new MigrationError('STALE_PLAN', 'Migration plan changed; inspect and confirm again', plan);
  if (plan.status === 'blocked') throw new MigrationError(plan.reasons[0]!.code, plan.reasons[0]!.message, plan);
  const materialsDigest = plan.materialsDigest;
  while (plan.steps.length) {
    const step = plan.steps[0]!, digest = plan.digest;
    try {
      raw.pragma('foreign_keys = ON');
      raw.transaction(() => {
        const checked = planner.inspect();
        if (checked.digest !== digest) throw new MigrationError('STALE_PLAN', 'Migration plan changed before step transaction', checked);
        if (checked.status === 'empty') raw.prepare(ledgerSql).run();
        runControlledSql(raw, step.sql);
        checkForeignKeys(raw);
        raw.prepare('INSERT INTO main.recorder_migrations (namespace, revision, digest, applied_at) VALUES (?, ?, ?, ?)')
          .run(step.namespace, step.revision, step.digest, Date.now());
      }).immediate();
      committed.push({ namespace: step.namespace, revision: step.revision });
    } catch (error) {
      const known = error instanceof MigrationError ? error : databaseFailure(error);
      const code = known.code === 'DATABASE_UNAVAILABLE' ? 'STEP_FAILED' : known.code;
      throw new MigrationError(code, code === 'STEP_FAILED' ? 'Migration step failed; earlier commits remain' : known.message,
        planner.inspect(), { namespace: step.namespace, revision: step.revision }, [...committed], { cause: error });
    }
    plan = planner.inspect();
    if (plan.materialsDigest !== materialsDigest) throw new MigrationError('STALE_PLAN', 'Migration materials changed between steps; inspect and confirm again', plan, undefined, [...committed]);
    if (plan.status === 'blocked') throw new MigrationError(plan.reasons[0]!.code, plan.reasons[0]!.message, plan, undefined, [...committed]);
  }
  return { committed, plan };
}
