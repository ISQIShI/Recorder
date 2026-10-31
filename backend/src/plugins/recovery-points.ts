import type { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { closeSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { StorageError, type MigrationCapture, type RecoveryManifest, type RecoveryMaterial, type RecoveryPoint, type RecoveryPoints } from '../storage-contract.js';
import type { Migration, MigrationLedgerEntry } from '../migration-contract.js';
import { privateDirectory, writePrivate, syncFile, syncDirectory, digest, fileDigest, readPrivate } from './recovery-files.js';
import '../domain.js';

export const inject = ['recorderDatabaseOwnership', 'recorderDatabase', 'recorderMigrationPlanner'];
export interface RecoveryConfig { directory?: string; timeoutMs?: number; fileTimeoutMs?: number }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const require = createRequire(import.meta.url);
const versions = { recorder: (require('../../package.json') as { version: string }).version,
  node: process.versions.node, betterSqlite3: (require('better-sqlite3/package.json') as { version: string }).version };
const readLedger = (raw: Database.Database) => raw.prepare('SELECT namespace, revision, digest, applied_at AS appliedAt FROM recorder_migrations ORDER BY namespace, revision').all() as MigrationLedgerEntry[];
const sortedLedger = (rows: MigrationLedgerEntry[]) => [...rows].sort((a, b) => a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : a.revision - b.revision);
const sameLedger = (a: MigrationLedgerEntry[], b: MigrationLedgerEntry[]) => JSON.stringify(sortedLedger(a)) === JSON.stringify(sortedLedger(b));
function validateDatabase(raw: Database.Database, ledger: MigrationLedgerEntry[]) {
  const integrity = raw.pragma('integrity_check') as { integrity_check: string }[];
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok' || (raw.pragma('foreign_key_check') as unknown[]).length || !sameLedger(readLedger(raw), ledger)) {
    throw new StorageError('RECOVERY_INVALID', 'Recovery database integrity, foreign keys or ledger do not match');
  }
}
function checkMaterials(capture: MigrationCapture) {
  const material = [...capture.installed, ...capture.retained];
  for (const row of capture.plan.applied) {
    const source = material.find(step => step.namespace === row.namespace && step.revision === row.revision);
    if (!source || digest(source.sql) !== row.digest) throw new StorageError('MATERIALS_UNAVAILABLE', 'Every committed migration needs matching recovery SQL material');
  }
  for (const step of capture.plan.steps) {
    const source = capture.installed.find(material => material.namespace === step.namespace && material.revision === step.revision);
    if (!source || source.sql !== step.sql || digest(source.sql) !== step.digest) throw new StorageError('RECOVERY_INVALID', 'Pending recovery SQL differs from the captured plan');
  }
}

/** Maintenance profile only. Does not confirm or execute an upgrade, restore data, or enable business services. */
export function apply(ctx: Context, config: RecoveryConfig = {}) {
  const owner = ctx.recorderDatabaseOwnership, database = ctx.recorderDatabase, planner = ctx.recorderMigrationPlanner;
  if (owner.filename === ':memory:') throw new StorageError('PATH_UNSUPPORTED', 'Recovery points require a persistent local database');
  const requested = resolve(config.directory ?? owner.filename + '.recovery-points');
  const root = join(realpathSync.native(dirname(requested)), basename(requested));
  const comparison = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  if (comparison(owner.filename).startsWith(comparison(root) + sep)) throw new StorageError('PATH_UNSUPPORTED', 'Recovery directory must not contain the live source database');
  const timeout = config.timeoutMs ?? 60000;
  const fileTimeout = config.fileTimeoutMs ?? 3600000;
  if (!Number.isSafeInteger(fileTimeout) || fileTimeout <= 0 || fileTimeout > 86400000) throw new StorageError('RECOVERY_FAILED', 'Invalid managed-file timeout');
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 300000) throw new StorageError('RECOVERY_FAILED', 'Invalid snapshot timeout');
  let active = true;
  const controller = new AbortController(), status: NonNullable<RecoveryPoints['status']> = { phase: 'idle', bytes: 0, total: 0 };
  function inventory(raw: Database.Database) {
    const files = ctx.get('recorderManagedFiles');
    if (files) return files.inventory(raw);
    if (raw.prepare("SELECT 1 FROM sqlite_master WHERE name='attachments_objects'").get() && raw.prepare("SELECT 1 FROM attachments_objects WHERE state='ready' AND record_id IS NOT NULL LIMIT 1").get()) throw new StorageError('MATERIALS_UNAVAILABLE', 'Managed-file storage participant is required');
    return [];
  }
  const pending = new Set<Promise<unknown>>();
  const assertActive = () => { if (!active) throw new StorageError('RECOVERY_CANCELLED', 'Recovery provider is withdrawing'); owner.assertHeld(); };
  function start<T>(operation: (raw: Database.Database) => Promise<T>): Promise<T> {
    if (!active) return Promise.reject(new StorageError('SERVICE_WITHDRAWN', 'Recovery provider was withdrawn'));
    const task = database.use(async raw => { assertActive(); return operation(raw); });
    pending.add(task); void task.finally(() => pending.delete(task)).catch(() => {}); return task;
  }
  function checkRoot() { assertActive(); return privateDirectory(root); }
  function rejectSidecars(filename: string) {
    for (const suffix of ['-wal', '-shm', '-journal']) {
      try { lstatSync(filename + suffix); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      throw new StorageError('RECOVERY_INVALID', 'Recovery snapshot has an unsealed SQLite sidecar');
    }
  }
  async function validateSnapshot(filename: string, ledger: MigrationLedgerEntry[], expected?: RecoveryManifest['snapshot']) {
    rejectSidecars(filename);
    const snapshotDigest = await fileDigest(filename), bytes = statSync(filename).size;
    if (expected && (snapshotDigest !== expected.digest || bytes !== expected.bytes)) throw new StorageError('RECOVERY_INVALID', 'Recovery snapshot checksum mismatch');
    // readonly SQLite still reads adjacent WAL. Validate an exact main-file copy in a fresh,
    // private directory instead; no unsealed sidecar can contribute to this connection.
    const directory = mkdtempSync(join(root, '.pending-validation-')), copy = join(directory, 'database.sqlite');
    try {
      copyFileSync(filename, copy);
      if (await fileDigest(copy) !== snapshotDigest) throw new StorageError('RECOVERY_INVALID', 'Recovery snapshot changed while copying');
      assertActive();
      const snapshot = new Database(copy, { readonly: true, fileMustExist: true });
      let objects: import('../attachments-contract.js').ManagedObject[];
      try { validateDatabase(snapshot, ledger); objects = inventory(snapshot); } finally { snapshot.close(); }
      rejectSidecars(filename);
      if (await fileDigest(filename) !== snapshotDigest || statSync(filename).size !== bytes) throw new StorageError('RECOVERY_INVALID', 'Recovery snapshot changed during validation');
      return { digest: snapshotDigest, bytes, objects };
    } finally {
      // Only remove our own known scratch files; a crash leaves a distinguishable pending directory.
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        try { unlinkSync(copy + suffix); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      rmdirSync(directory);
    }
  }
  async function verify(id: string): Promise<RecoveryPoint> {
    if (!uuid.test(id)) throw new StorageError('RECOVERY_INVALID', 'Invalid recovery point identifier');
    checkRoot();
    const directory = join(root, id), info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new StorageError('RECOVERY_INVALID', 'Recovery point must be a sealed regular directory');
    const manifestText = readPrivate(join(directory, 'manifest.json'));
    const seal = JSON.parse(readPrivate(join(directory, 'seal.json'))) as { formatVersion: number; manifestDigest: string };
    if (seal.formatVersion !== 1 || seal.manifestDigest !== digest(manifestText)) throw new StorageError('RECOVERY_INVALID', 'Recovery manifest checksum mismatch');
    const manifest = JSON.parse(manifestText) as RecoveryManifest;
    if (![1, 2].includes(manifest.formatVersion) || manifest.state !== 'sealed' || manifest.id !== id || manifest.snapshot.file !== 'database.sqlite' ||
      manifest.executableArchived !== false || manifest.source.planDigest !== manifest.plan.digest ||
      manifest.source.materialsDigest !== manifest.plan.materialsDigest || !sameLedger(manifest.ledger, manifest.plan.applied)) {
      throw new StorageError('RECOVERY_INVALID', 'Recovery manifest identity or ledger mismatch');
    }
    const materialDirectory = lstatSync(join(directory, 'materials'));
    if (!materialDirectory.isDirectory() || materialDirectory.isSymbolicLink()) throw new StorageError('RECOVERY_INVALID', 'Invalid recovery material directory');
    const installed: Migration[] = [], retained: Migration[] = [];
    const seen = new Set<string>();
    for (const material of manifest.materials) {
      if (!/^materials\/\d{6}\.sql$/.test(material.file) || !['installed', 'retained'].includes(material.role)) throw new StorageError('RECOVERY_INVALID', 'Invalid recovery material path');
      const { file, digest: expected, role, ...step } = material, sql = readPrivate(join(directory, file));
      if (digest(sql) !== expected || seen.has(JSON.stringify([step.namespace, step.revision]))) throw new StorageError('RECOVERY_INVALID', 'Recovery SQL checksum or identity mismatch');
      seen.add(JSON.stringify([step.namespace, step.revision]));
      (role === 'installed' ? installed : retained).push({ ...step, sql });
    }
    checkMaterials({ plan: manifest.plan, installed, retained });
    const filename = join(directory, 'database.sqlite');
    const snapshot = await validateSnapshot(filename, manifest.ledger, manifest.snapshot);
    if ((manifest.formatVersion === 1 && (manifest.ledger.some(row => row.namespace === 'attachments') || snapshot.objects.length)) ||
      (manifest.formatVersion === 2 && (!Array.isArray(manifest.objects) || JSON.stringify(manifest.objects) !== JSON.stringify(snapshot.objects)))) throw new StorageError('RECOVERY_INVALID', 'Recovery manifest does not include the committed attachment set');
    if (manifest.formatVersion === 2) {
      const objects = join(directory, 'objects'); const stat = lstatSync(objects);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new StorageError('RECOVERY_INVALID', 'Invalid managed-object archive');
      if (snapshot.objects.length) { const files = ctx.get('recorderManagedFiles'); if (!files) throw new StorageError('MATERIALS_UNAVAILABLE', 'Managed-file storage participant is required'); await files.verify(snapshot.objects, objects, AbortSignal.any([controller.signal, AbortSignal.timeout(fileTimeout)])); }
    }
    return { id, directory, manifestDigest: seal.manifestDigest, manifest };
  }
  const service: RecoveryPoints = {
    status,
    create(expectedPlanDigest) { return start(async raw => {
      let directory: string | undefined;
      try {
        if (raw.inTransaction || !planner.capture) throw new StorageError('MATERIALS_UNAVAILABLE', 'Snapshot requires a complete migration capture outside a transaction');
        const capture = planner.capture(), plan = capture.plan;
        if (plan.digest !== expectedPlanDigest) throw new StorageError('STALE_PLAN', 'Migration plan changed before snapshot');
        if (!['compatible', 'upgrade-required'].includes(plan.status) || plan.database !== owner.filename) throw new StorageError('RECOVERY_INVALID', 'Source is not an inspectable, tracked persistent database');
        checkMaterials(capture); validateDatabase(raw, plan.applied);
        checkRoot();
        const id = randomUUID(); directory = join(root, '.pending-' + id);
        mkdirSync(directory, { mode: 0o700 }); mkdirSync(join(directory, 'materials'), { mode: 0o700 });
        writePrivate(join(directory, 'incomplete.json'), JSON.stringify({ formatVersion: 1, state: 'incomplete', id, planDigest: plan.digest }));
        const materials: RecoveryMaterial[] = [];
        for (const [role, steps] of [['installed', capture.installed], ['retained', capture.retained]] as const) for (const source of steps) {
          const { sql, ...step } = source, file = `materials/${String(materials.length).padStart(6, '0')}.sql`;
          writePrivate(join(directory, file), sql); materials.push({ ...step, file, digest: digest(sql), role });
        }
        const filename = join(directory, 'database.sqlite'); closeSync(openSync(filename, 'wx', 0o600)); status.phase = 'database'; status.bytes = 0; status.total = 0;
        const deadline = Date.now() + timeout;
        await raw.backup(filename, { progress() {
          assertActive(); if (Date.now() > deadline) throw new StorageError('RECOVERY_FAILED', 'Snapshot exceeded its time limit');
          return 100;
        } });
        assertActive();
        const { objects, ...snapshot } = await validateSnapshot(filename, plan.applied);
        const archive = join(directory, 'objects'); mkdirSync(archive, { mode: 0o700 });
        status.phase = 'files'; status.total = objects.reduce((n, object) => n + object.bytes, 0);
        const files = ctx.get('recorderManagedFiles'), fileSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(fileTimeout)]);
        if (objects.length) {
          if (!files) throw new StorageError('MATERIALS_UNAVAILABLE', 'Managed-file storage participant is required');
          await files.copy(objects, join(files.root, 'objects'), archive, fileSignal, bytes => { status.bytes += bytes; });
          status.phase = 'verifying'; await files.verify(objects, archive, fileSignal);
        }
        // Re-read every SQL file, not just the database; a corrupt archive is never sealed.
        for (const material of materials) if (digest(readPrivate(join(directory, material.file))) !== material.digest) throw new StorageError('RECOVERY_INVALID', 'Archived migration SQL changed before sealing');
        assertActive();
        if (planner.inspect().digest !== plan.digest) throw new StorageError('STALE_PLAN', 'Migration plan changed during snapshot');
        validateDatabase(raw, plan.applied);
        const manifest: RecoveryManifest = { formatVersion: 2, objects, state: 'sealed', id, createdAt: new Date().toISOString(),
          source: { filename: owner.filename, planDigest: plan.digest, materialsDigest: plan.materialsDigest }, plan, ledger: plan.applied,
          versions: { ...versions, sqlite: (raw.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version },
          materials, snapshot: { file: 'database.sqlite', ...snapshot },
          validation: { integrity: 'ok', foreignKeys: 'ok', ledger: 'ok', materials: 'ok' }, executableArchived: false };
        const manifestText = JSON.stringify(manifest, null, 2), manifestDigest = digest(manifestText);
        writePrivate(join(directory, 'README.txt'), 'Recorder upgrade recovery point. Contains account/session secrets; keep private.\nNo executable is archived. Version labels alone do not guarantee an older program can start.\nT02 does not restore or replace a database. Use a separately verified isolated recovery procedure.\n');
        syncFile(filename); syncDirectory(join(directory, 'materials'));
        writePrivate(join(directory, 'manifest.json'), manifestText);
        writePrivate(join(directory, 'seal.json'), JSON.stringify({ formatVersion: 1, manifestDigest }));
        unlinkSync(join(directory, 'incomplete.json'));
        syncDirectory(directory); assertActive();
        const sealed = join(root, id); renameSync(directory, sealed);
        try { syncDirectory(root); } catch (error) { renameSync(sealed, directory); throw error; }
        return { id, directory: sealed, manifestDigest, manifest };
      } catch (error) {
        if (error instanceof StorageError) throw error;
        throw new StorageError(active ? 'RECOVERY_FAILED' : 'RECOVERY_CANCELLED', 'Recovery point was not made available', { cause: error });
      } finally { status.phase = 'idle'; }
    }); },
    verify(id) { return start(async () => {
      try { return await verify(id); } catch (error) { if (error instanceof StorageError) throw error; throw new StorageError('RECOVERY_INVALID', 'Recovery point could not be verified', { cause: error }); }
    }); },
    list() { return start(async () => {
      checkRoot(); const valid: RecoveryPoint[] = [], invalid: { id: string; code: string }[] = [], incomplete: string[] = [];
      for (const name of readdirSync(root).sort()) {
        assertActive();
        if (name.startsWith('.pending-')) incomplete.push(name);
        else if (uuid.test(name)) {
          try { valid.push(await verify(name)); } catch (error) { invalid.push({ id: name, code: error instanceof StorageError ? error.code : 'RECOVERY_INVALID' }); }
        }
      }
      return { valid, invalid, incomplete };
    }); },
  };
  ctx.effect(() => async () => { active = false; controller.abort(); await Promise.allSettled([...pending]); });
  ctx.provide('recorderRecoveryPoints', service);
}
