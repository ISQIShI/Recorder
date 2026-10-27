import type { Context } from '@deepseek-ai/cordis';
import { randomUUID } from 'node:crypto';
import { MaintenanceError, type MaintenanceCoordinator, type MaintenanceInspection, type MaintenanceRun } from '../maintenance-contract.js';
import { MigrationError, type MigrationPlan } from '../migration-contract.js';
import '../domain.js';

export const inject = ['recorderDatabaseOwnership', 'recorderDatabase', 'recorderMigrationPlanner', 'recorderMigrationExecutor', 'recorderRecoveryPoints', 'recorderMaintenanceRuns'];
const key = (row: { namespace: string; revision: number }) => JSON.stringify([row.namespace, row.revision]);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function prefix(run: MaintenanceRun, plan: MigrationPlan) {
  if (plan.status === 'blocked' || plan.database !== run.original.database || plan.materialsDigest !== run.original.materialsDigest) throw new MaintenanceError('MANUAL_INTERVENTION', 'Source or migration materials changed');
  const original = run.original, rows = new Map(plan.applied.map(row => [key(row), row]));
  for (const row of original.applied) if (!same(rows.get(key(row)), row)) throw new MaintenanceError('MANUAL_INTERVENTION', 'Original ledger changed');
  let committed = 0;
  for (const step of original.steps) {
    const row = rows.get(key(step));
    if (!row) break;
    if (row.digest !== step.digest) throw new MaintenanceError('MANUAL_INTERVENTION', 'Committed digest changed');
    committed++;
  }
  if (plan.applied.length !== original.applied.length + committed || !same(plan.steps, original.steps.slice(committed))) throw new MaintenanceError('MANUAL_INTERVENTION', 'Ledger is not the confirmed ordered prefix');
  for (const row of run.observed) if (!same(rows.get(key(row)), row)) throw new MaintenanceError('MANUAL_INTERVENTION', 'Previously recorded commit disappeared');
  return committed;
}
export function apply(ctx: Context) {
  const owner = ctx.recorderDatabaseOwnership, database = ctx.recorderDatabase, planner = ctx.recorderMigrationPlanner;
  const executor = ctx.recorderMigrationExecutor, points = ctx.recorderRecoveryPoints, journal = ctx.recorderMaintenanceRuns;
  let active = true, busy = false;
  const assertActive = () => { if (!active) throw new MaintenanceError('SERVICE_WITHDRAWN', 'Maintenance coordinator was withdrawn'); owner.assertHeld(); };
  const ongoing = new Set<Promise<unknown>>();
  function start<T>(action: () => Promise<T>) {
    assertActive();
    if (busy) return Promise.reject(new MaintenanceError('MAINTENANCE_BUSY', 'Another maintenance operation is in progress'));
    busy = true;
    const task = database.use(async () => { assertActive(); return action(); });
    ongoing.add(task); void task.finally(() => { busy = false; ongoing.delete(task); }).catch(() => {}); return task;
  }
  async function inspect(): Promise<MaintenanceInspection> {
    assertActive();
    const plan = planner.inspect(), index = journal.read(), unfinished = index.runs.filter(run => run.phase !== 'complete');
    const result: MaintenanceInspection = { plan, state: 'idle', committed: 0, pendingFiles: index.pending };
    if (index.pending.some(name => !index.runs.some(run => name.startsWith('.pending-' + run.id + '.json-'))) || unfinished.length > 1) {
      return { ...result, state: 'manual', reason: 'Unpublished or multiple unfinished runs require manual inspection' };
    }
    if (!unfinished.length) return result;
    const run = unfinished[0]!; result.run = run;
    try {
      result.committed = prefix(run, plan);
      if (run.original.status === 'empty') {
        if (run.original.applied.length || run.recovery) throw new Error('Invalid initialization run');
      } else if (run.original.status !== 'upgrade-required') throw new Error('Invalid original run plan');
      else if (run.recovery) {
        const point = await points.verify(run.recovery.id);
        if (point.manifestDigest !== run.recovery.manifestDigest || point.manifest.source.filename !== owner.filename || !same(point.manifest.plan, run.original)) throw new Error('Recovery point does not match the original confirmed source and plan');
      } else if (result.committed || run.phase !== 'snapshot' || plan.digest !== run.original.digest) throw new Error('No pre-upgrade recovery point for the observed commits');
      assertActive();
      result.state = run.phase === 'snapshot' && !run.recovery ? 'snapshot-needed' : plan.steps.length ? 'can-continue' : 'final-validation';
      return result;
    } catch (error) {
      assertActive();
      return { ...result, state: 'manual', reason: error instanceof Error && 'code' in error ? String(error.code) : 'Run, recovery point or committed prefix does not match' };
    }
  }
  function save(run: MaintenanceRun, phase: MaintenanceRun['phase'], observed = run.observed) {
    assertActive(); run.phase = phase; run.observed = observed; run.updatedAt = new Date().toISOString(); journal.write(run);
  }
  async function execute(expectedDigest: string, continuing: boolean) {
    const inspection = await inspect(), plan = inspection.plan;
    if (inspection.state === 'manual') throw new MaintenanceError('MANUAL_INTERVENTION', inspection.reason!);
    if (plan.status === 'blocked') throw new MigrationError(plan.reasons[0]!.code, plan.reasons[0]!.message, plan);
    if (!inspection.run && !plan.steps.length && !continuing) return inspection;
    if (!expectedDigest) throw new MaintenanceError('CONFIRMATION_REQUIRED', 'Inspect and explicitly confirm the current plan digest');
    if (plan.digest !== expectedDigest || planner.inspect().digest !== expectedDigest) throw new MaintenanceError('STALE_PLAN', 'Plan changed; inspect and explicitly confirm again');
    if (continuing !== !!inspection.run) throw new MaintenanceError('MAINTENANCE_INCOMPLETE', continuing ? 'No unfinished run to resume' : 'Inspect the unfinished run and explicitly resume it');
    if (!executor.executeStep) throw new MaintenanceError('MAINTENANCE_UNAVAILABLE', 'A controlled single-step migration provider is required');
    let run = inspection.run;
    if (!run) {
      const now = new Date().toISOString();
      run = { formatVersion: 1, id: randomUUID(), source: owner.filename, createdAt: now, updatedAt: now,
        phase: plan.status === 'empty' ? 'executing' : 'snapshot', original: plan, observed: plan.applied };
      journal.write(run); // Durable intent precedes both snapshot creation and the first SQL transaction.
    }
    if (run.original.status !== 'empty' && !run.recovery) {
      const point = await points.create(plan.digest), verified = await points.verify(point.id);
      if (point.manifestDigest !== verified.manifestDigest || verified.manifest.source.filename !== owner.filename || !same(verified.manifest.plan, run.original)) throw new MaintenanceError('MANUAL_INTERVENTION', 'Recovery point does not match this maintenance run');
      run.recovery = { id: verified.id, manifestDigest: verified.manifestDigest };
    }
    save(run, 'executing', planner.inspect().applied);
    let current = planner.inspect(); prefix(run, current);
    while (current.steps.length) {
      assertActive();
      const before = current.applied.length;
      executor.executeStep(current.digest);
      current = planner.inspect(); prefix(run, current);
      if (current.applied.length !== before + 1) throw new MaintenanceError('MANUAL_INTERVENTION', 'Single-step provider did not commit exactly one expected step');
      save(run, 'executing', current.applied);
    }
    save(run, 'validating', current.applied);
    const raw = database.raw;
    const integrity = raw.pragma('integrity_check') as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok' || (raw.pragma('foreign_key_check') as unknown[]).length) throw new MaintenanceError('MANUAL_INTERVENTION', 'Final database integrity or foreign-key validation failed');
    current = planner.inspect(); prefix(run, current);
    if (current.steps.length || !['compatible', 'empty'].includes(current.status)) throw new MaintenanceError('MANUAL_INTERVENTION', 'Final migration state is not compatible');
    save(run, 'complete', current.applied);
    return inspect();
  }
  ctx.effect(() => async () => { active = false; await Promise.allSettled([...ongoing]); });
  ctx.provide('recorderMaintenance', { inspect: () => start(inspect), upgrade: digest => start(() => execute(digest, false)),
    resume: digest => start(() => execute(digest, true)) } satisfies MaintenanceCoordinator);
}
