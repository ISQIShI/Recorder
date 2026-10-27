import type { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import { constants, copyFileSync, lstatSync, readdirSync, realpathSync, statfsSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { MaintenanceError, type IsolatedRecovery, type RestoredDatabase } from '../maintenance-contract.js';
import type { RecoveryPoint } from '../storage-contract.js';
import { fileDigest, privateDirectory, readPrivate, syncDirectory, syncFile, writePrivate } from './recovery-files.js';
import { checkFilesystem, localPath } from './storage-path.js';
import { exists, publish, runId } from './maintenance-files.js';
import '../domain.js';

export const inject = ['recorderDatabaseOwnership', 'recorderDatabase', 'recorderRecoveryPoints'];
const marker = 'database.sqlite.restore.json';
const normalize = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
const overlaps = (a: string, b: string) => normalize(a) === normalize(b) || normalize(a).startsWith(normalize(b) + sep) || normalize(b).startsWith(normalize(a) + sep);
export function apply(ctx: Context) {
  const owner = ctx.recorderDatabaseOwnership, database = ctx.recorderDatabase, points = ctx.recorderRecoveryPoints;
  let active = true, busy = false;
  const pending = new Set<Promise<unknown>>();
  const assertActive = () => { if (!active) throw new MaintenanceError('SERVICE_WITHDRAWN', 'Isolated recovery provider was withdrawn'); owner.assertHeld(); };
  function start<T>(action: () => Promise<T>) {
    assertActive();
    if (busy) return Promise.reject(new MaintenanceError('MAINTENANCE_BUSY', 'Another isolated recovery operation is in progress'));
    busy = true;
    const task = database.use(async () => { assertActive(); return action(); });
    pending.add(task); void task.finally(() => { pending.delete(task); busy = false; }).catch(() => {}); return task;
  }
  function targetPath(input: string, point: RecoveryPoint) {
    const requested = resolve(localPath(input));
    if (exists(requested)) {
      const stat = lstatSync(requested);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new MaintenanceError('TARGET_UNSAFE', 'Recovery target must be a new or empty ordinary directory');
    }
    const target = join(realpathSync.native(dirname(requested)), basename(requested)); checkFilesystem(dirname(target));
    if (overlaps(target, dirname(owner.filename)) || overlaps(target, dirname(point.directory))) throw new MaintenanceError('TARGET_UNSAFE', 'Recovery target overlaps the source or recovery-point directory');
    return target;
  }
  async function checkedPoint(id: string) {
    const point = await points.verify(id); assertActive();
    if (point.manifest.source.filename !== owner.filename) throw new MaintenanceError('RESTORE_INVALID', 'Recovery point belongs to a different source');
    return point;
  }
  function requireSpace(target: string, point: RecoveryPoint) {
    // The restored database and T02's validation copy may coexist. This is a preflight, not a reservation.
    const roots = [dirname(target), dirname(point.directory)], infos = roots.map(path => statfsSync(path, { bigint: true }));
    const sameVolume = lstatSync(roots[0]!).dev === lstatSync(roots[1]!).dev;
    const needed = BigInt(point.manifest.snapshot.bytes);
    for (const info of infos) if (info.bavail * info.bsize < needed * (sameVolume ? 2n : 1n)) throw new MaintenanceError('SPACE_REQUIRED', 'Leave space for both the restored database and a separate validation copy');
  }
  async function validateTarget(target: string, point: RecoveryPoint) {
    assertActive();
    const filename = join(target, 'database.sqlite');
    for (const suffix of ['-wal', '-shm', '-journal']) if (exists(filename + suffix)) throw new MaintenanceError('RESTORE_INVALID', 'Isolated target has unverified SQLite sidecars');
    if (lstatSync(filename).size !== point.manifest.snapshot.bytes || await fileDigest(filename) !== point.manifest.snapshot.digest) throw new MaintenanceError('RESTORE_INVALID', 'Isolated database differs from the sealed snapshot');
    const raw = new Database(filename, { readonly: true, fileMustExist: true });
    try {
      const integrity = raw.pragma('integrity_check') as { integrity_check: string }[];
      const ledger = raw.prepare('SELECT namespace, revision, digest, applied_at AS appliedAt FROM recorder_migrations ORDER BY namespace, revision').all();
      const sorted = [...point.manifest.ledger].sort((a, b) => a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : a.revision - b.revision);
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok' || (raw.pragma('foreign_key_check') as unknown[]).length || JSON.stringify(ledger) !== JSON.stringify(sorted)) throw new MaintenanceError('RESTORE_INVALID', 'Isolated database integrity, foreign keys or ledger differ');
    } finally {
      raw.close();
      // These sidecars were created only by our readonly connection in the private isolated target.
      // Preexisting sidecars are rejected above, never removed or checkpointed.
      for (const suffix of ['-wal', '-shm']) if (exists(filename + suffix)) unlinkSync(filename + suffix);
    }
    if (await fileDigest(filename) !== point.manifest.snapshot.digest) throw new MaintenanceError('RESTORE_INVALID', 'Isolated main file changed during validation');
    assertActive();
  }
  const service: IsolatedRecovery = {
    restore(id, requested) { return start(async () => {
      const point = await checkedPoint(id), target = targetPath(requested, point);
      if (exists(target) && readdirSync(target).length) throw new MaintenanceError('TARGET_UNSAFE', 'Recovery target is not empty; existing contents are preserved');
      requireSpace(target, point); privateDirectory(target);
      const result: RestoredDatabase = { formatVersion: 1, state: 'incomplete', filename: 'database.sqlite', source: owner.filename,
        pointId: point.id, manifestDigest: point.manifestDigest, snapshotDigest: point.manifest.snapshot.digest, versions: point.manifest.versions };
      writePrivate(join(target, marker), JSON.stringify(result));
      assertActive(); copyFileSync(join(point.directory, point.manifest.snapshot.file), join(target, result.filename), constants.COPYFILE_EXCL);
      await validateTarget(target, point);
      const verified = await checkedPoint(id);
      if (verified.manifestDigest !== point.manifestDigest) throw new MaintenanceError('RESTORE_INVALID', 'Recovery point changed during isolated restoration');
      syncFile(join(target, result.filename)); result.state = 'isolated'; publish(target, marker, result); syncDirectory(target);
      return result;
    }); },
    verify(requested) { return start(async () => {
      const path = resolve(localPath(requested)), result = JSON.parse(readPrivate(join(path, marker))) as RestoredDatabase;
      if (result.formatVersion !== 1 || result.state !== 'isolated' || result.filename !== 'database.sqlite' || !runId.test(result.pointId) || result.source !== owner.filename) throw new MaintenanceError('RESTORE_INVALID', 'Target is not a completed isolated recovery');
      const point = await checkedPoint(result.pointId), target = targetPath(path, point); privateDirectory(target);
      if (result.manifestDigest !== point.manifestDigest || result.snapshotDigest !== point.manifest.snapshot.digest) throw new MaintenanceError('RESTORE_INVALID', 'Isolated target metadata differs from its recovery point');
      await validateTarget(target, point); return result;
    }); },
  };
  ctx.effect(() => async () => { active = false; await Promise.allSettled([...pending]); });
  ctx.provide('recorderIsolatedRecovery', service);
}
