import type { Context } from '@deepseek-ai/cordis';
import { MigrationError, type MigrationExecutor } from '../migration-contract.js';
import { executeMigrations } from './migrations/execute.js';
import '../domain.js';
export const inject = ['recorderDatabase', 'recorderMigrationPlanner'];
/** Explicit maintenance/test assembly only. The business application never mounts this capability. */
export function apply(ctx: Context) {
  let active = true;
  ctx.effect(() => () => { active = false; });
  const raw = ctx.recorderDatabase.raw, planner = ctx.recorderMigrationPlanner;
  ctx.provide('recorderMigrationExecutor', { execute(expectedDigest) {
    if (!active) throw new MigrationError('SERVICE_WITHDRAWN', 'Migration executor has been withdrawn');
    return executeMigrations(raw, planner, expectedDigest);
  } } satisfies MigrationExecutor);
}
