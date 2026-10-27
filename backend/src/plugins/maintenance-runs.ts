import type { Context } from '@deepseek-ai/cordis';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MaintenanceError, type MaintenanceRun, type MaintenanceRuns } from '../maintenance-contract.js';
import { digest, privateDirectory, readPrivate } from './recovery-files.js';
import { exists, publish, runId } from './maintenance-files.js';
import '../domain.js';

export const inject = ['recorderDatabaseOwnership'];
function validate(run: MaintenanceRun, filename: string) {
  if (!run || run.formatVersion !== 1 || !runId.test(run.id) || run.source !== filename ||
    !['snapshot', 'executing', 'validating', 'complete'].includes(run.phase) ||
    !Number.isFinite(Date.parse(run.createdAt)) || !Number.isFinite(Date.parse(run.updatedAt)) ||
    run.original?.formatVersion !== 1 || !/^[a-f0-9]{64}$/.test(run.original.digest) ||
    !/^[a-f0-9]{64}$/.test(run.original.materialsDigest) || !Array.isArray(run.original.applied) ||
    !Array.isArray(run.original.steps) || !Array.isArray(run.observed) ||
    (run.recovery && (!runId.test(run.recovery.id) || !/^[a-f0-9]{64}$/.test(run.recovery.manifestDigest)))) {
    throw new MaintenanceError('RUN_INVALID', 'Maintenance run metadata is invalid; preserve it for manual inspection');
  }
}
export function apply(ctx: Context) {
  const owner = ctx.recorderDatabaseOwnership;
  const directory = owner.filename + '.maintenance';
  let active = true;
  const assertActive = () => { if (!active) throw new MaintenanceError('SERVICE_WITHDRAWN', 'Maintenance journal was withdrawn'); owner.assertHeld(); };
  const service: MaintenanceRuns = {
    directory,
    read() {
      assertActive();
      if (!exists(directory)) return { runs: [], pending: [] };
      privateDirectory(directory);
      const runs: MaintenanceRun[] = [], pending: string[] = [];
      try {
        for (const name of readdirSync(directory).sort()) {
          if (name.startsWith('.pending-')) { pending.push(name); continue; }
          if (!name.endsWith('.json') || !runId.test(name.slice(0, -5))) throw new Error('Unknown journal entry');
          const envelope = JSON.parse(readPrivate(join(directory, name))) as { run: MaintenanceRun; checksum: string };
          if (envelope.checksum !== digest(JSON.stringify(envelope.run))) throw new Error('Run checksum differs');
          const run = envelope.run;
          validate(run, owner.filename);
          if (name !== run.id + '.json') throw new Error('Run identifier differs from its filename');
          runs.push(run);
        }
      } catch (cause) { throw new MaintenanceError('RUN_INVALID', 'Maintenance journal cannot be trusted; no upgrade or startup is allowed', { cause }); }
      return { runs, pending };
    },
    write(run) {
      assertActive(); validate(run, owner.filename); privateDirectory(directory);
      publish(directory, run.id + '.json', { run, checksum: digest(JSON.stringify(run)) });
    },
    assertStartup() {
      assertActive();
      if (exists(owner.filename + '.restore.json')) throw new MaintenanceError('ISOLATED_RECOVERY', 'An isolated recovery must not start business services; formal activation is not implemented');
      const { runs, pending } = service.read();
      // A published run is authoritative. Unpublished temporary records without an owner need manual review.
      if (pending.some(name => !runs.some(run => name.startsWith('.pending-' + run.id + '.json-'))) || runs.some(run => run.phase !== 'complete')) {
        throw new MaintenanceError('MAINTENANCE_INCOMPLETE', 'Unfinished maintenance requires inspection and explicit continuation before business startup');
      }
    },
  };
  ctx.effect(() => () => { active = false; });
  ctx.provide('recorderMaintenanceRuns', service);
}
