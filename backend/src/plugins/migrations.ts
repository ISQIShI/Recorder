import type { Context } from '@deepseek-ai/cordis';
import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { MigrationError, type Migration, type MigrationPlanner, type MigrationSource } from '../migration-contract.js';
import { checksum, inspectMigrations } from './migrations/plan.js';
import { executeMigrations } from './migrations/execute.js';
import '../domain.js';
export type { Migration, MigrationSource } from '../migration-contract.js';
export const inject = ['recorderDatabase'];
export interface MigrationConfig { sources: readonly MigrationSource[]; retainedSources?: readonly MigrationSource[]; mode?: 'startup' | 'inspect' }
/** Legacy isolated-test adapter. Not a business/maintenance entry: it provides neither recovery nor exclusion. */
export function applyMigrations(raw: Database.Database, migrations: readonly Migration[]) {
  const planner = { inspect: () => inspectMigrations(raw, migrations) };
  return executeMigrations(raw, planner, planner.inspect().digest);
}
function load(sources: readonly MigrationSource[]): Migration[] {
  return sources.map(({ file, ...step }) => ({ ...step, sql: readFileSync(new URL(file, new URL('../../migrations/', import.meta.url)), 'utf8') }));
}
export function apply(ctx: Context, config: MigrationConfig) {
  if (config.mode !== undefined && !['startup', 'inspect'].includes(config.mode)) throw new MigrationError('INVALID_MANIFEST', 'Unknown migration profile');
  let active = true;
  const raw = ctx.recorderDatabase.raw;
  const planner: MigrationPlanner = { inspect() {
    if (!active) throw new MigrationError('SERVICE_WITHDRAWN', 'Migration planner has been withdrawn');
    try { return inspectMigrations(raw, load(config.sources), load(config.retainedSources ?? [])); }
    catch {
      // Material loading cannot create tables. Keep a structured blocked result for read-only callers.
      const plan = inspectMigrations(raw, []);
      if (plan.status === 'blocked') return plan;
      return { ...plan, status: 'blocked', digest: checksum(plan.digest + ':materials-unreadable'), steps: [],
        reasons: [{ code: 'INVALID_MANIFEST', message: 'Installed migration materials cannot be read' }] };
    }
  } };
  ctx.effect(() => () => { active = false; });
  ctx.provide('recorderMigrationPlanner', planner);
  if (config.mode === 'inspect') return;
  const plan = planner.inspect();
  if (plan.status === 'blocked' || plan.status === 'upgrade-required') {
    throw new MigrationError(plan.reasons[0]!.code, plan.reasons[0]!.message, plan);
  }
  if (plan.status === 'empty') executeMigrations(raw, planner, plan.digest);
  // Readiness is distinct from the inspect-only service; business providers depend on this gate.
  ctx.provide('recorderMigrations', { ready: true });
}
