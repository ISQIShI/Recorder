import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationError, type Migration, type MigrationKey, type MigrationLedgerEntry, type MigrationPlan, type MigrationStep } from '../../migration-contract.js';
import { controlledStatements } from './sql.js';

export const ledgerSql = 'CREATE TABLE recorder_migrations (namespace TEXT NOT NULL, revision INTEGER NOT NULL, digest TEXT NOT NULL, applied_at INTEGER NOT NULL, PRIMARY KEY(namespace, revision))';
export const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex');
const key = (step: MigrationKey) => JSON.stringify([step.namespace, step.revision]);
const compare = (a: MigrationKey, b: MigrationKey) => a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : a.revision - b.revision;
const memoryIds = new WeakMap<Database.Database, string>();
const validName = (name: unknown): name is string => typeof name === 'string' && !!name.length && !name.includes('\0');
const validRevision = (revision: unknown): revision is number => Number.isSafeInteger(revision) && Number(revision) > 0;
export function databaseLocation(raw: Database.Database) {
  if (raw.name && raw.name !== ':memory:') return realpathSync(resolve(raw.name));
  if (!memoryIds.has(raw)) memoryIds.set(raw, 'memory:' + randomUUID());
  return memoryIds.get(raw)!;
}
export const databaseFailure = MigrationError.fromDatabase;
function normalize(migrations: readonly Migration[]): MigrationStep[] {
  if (!Array.isArray(migrations)) throw new MigrationError('INVALID_MANIFEST', 'Migration history must be an array');
  const seen = new Set<string>();
  const result = migrations.map(step => {
    if (!step || !validName(step.namespace) || !validRevision(step.revision) || typeof step.sql !== 'string' ||
      (step.packageVersion !== undefined && (typeof step.packageVersion !== 'string' || !step.packageVersion))) {
      throw new MigrationError('INVALID_MANIFEST', 'Invalid migration metadata');
    }
    if (seen.has(key(step))) throw new MigrationError('DUPLICATE_MIGRATION', 'Duplicate migration', undefined, step);
    seen.add(key(step));
    if ((step.requires !== undefined && !Array.isArray(step.requires)) || (step.dependencies !== undefined && !Array.isArray(step.dependencies))) {
      throw new MigrationError('INVALID_MANIFEST', 'Invalid migration dependencies', undefined, step);
    }
    const dependencies = new Map<string, number>();
    for (const dependency of [...(step.requires ?? []).map((namespace: string) => ({ namespace, revision: 1 })), ...(step.dependencies ?? []),
      ...(step.revision > 1 ? [{ namespace: step.namespace, revision: step.revision - 1 }] : [])]) {
      if (!dependency || !validName(dependency.namespace) || !validRevision(dependency.revision)) throw new MigrationError('INVALID_MANIFEST', 'Invalid dependency revision', undefined, step);
      dependencies.set(dependency.namespace, Math.max(dependencies.get(dependency.namespace) ?? 0, dependency.revision));
    }
    controlledStatements(step.sql);
    return { namespace: step.namespace, revision: step.revision, sql: step.sql, digest: checksum(step.sql),
      dependencies: [...dependencies].map(([namespace, revision]) => ({ namespace, revision })).sort(compare),
      ...(step.packageVersion === undefined ? {} : { packageVersion: step.packageVersion }) };
  }).sort(compare);
  const revisions = new Map<string, number>();
  for (const step of result) {
    if (step.revision !== (revisions.get(step.namespace) ?? 0) + 1) throw new MigrationError('HISTORY_GAP', 'Migration history must contain every revision from 1', undefined, step);
    revisions.set(step.namespace, step.revision);
  }
  return result;
}
function readLedger(raw: Database.Database, schema: { type: string; name: string; tbl_name: string; sql: string | null }[]): MigrationLedgerEntry[] {
  const ledger = schema.find(row => row.name.toLowerCase() === 'recorder_migrations');
  if (!ledger) {
    if (schema.length) throw new MigrationError('UNTRACKED_DATABASE', 'Nonempty database has no trusted migration ledger');
    return [];
  }
  const columns = raw.pragma('main.table_xinfo(recorder_migrations)') as { name: string; type: string; notnull: number; pk: number; hidden: number }[];
  const shape = columns.map(({ name, type, notnull, pk, hidden }) => [name, type.toUpperCase(), notnull, pk, hidden]);
  if (ledger.type !== 'table' || JSON.stringify(shape) !== JSON.stringify([
    ['namespace', 'TEXT', 1, 1, 0], ['revision', 'INTEGER', 1, 2, 0], ['digest', 'TEXT', 1, 0, 0], ['applied_at', 'INTEGER', 1, 0, 0],
  ]) || schema.some(row => row.type === 'trigger' && row.tbl_name.toLowerCase() === 'recorder_migrations') ||
    (raw.pragma('main.foreign_key_list(recorder_migrations)') as unknown[]).length) {
    throw new MigrationError('INVALID_LEDGER', 'Migration ledger schema is not supported');
  }
  const rows = raw.prepare('SELECT namespace, revision, digest, applied_at AS appliedAt FROM main.recorder_migrations').all() as MigrationLedgerEntry[];
  const revisions = new Map<string, number>();
  for (const row of rows.sort(compare)) {
    if (!validName(row.namespace) || !validRevision(row.revision) || !/^[a-f0-9]{64}$/.test(row.digest) ||
      !Number.isSafeInteger(row.appliedAt) || row.appliedAt < 0 || row.revision !== (revisions.get(row.namespace) ?? 0) + 1) {
      throw new MigrationError('INVALID_LEDGER', 'Migration ledger is not a valid committed prefix');
    }
    revisions.set(row.namespace, row.revision);
  }
  return rows;
}
export function checkForeignKeys(raw: Database.Database) {
  try {
    if ((raw.pragma('main.foreign_key_check') as unknown[]).length) throw new Error('Foreign key violations');
  } catch (error) { throw new MigrationError('FOREIGN_KEY_FAILED', 'Foreign key check failed', undefined, undefined, [], { cause: error }); }
}

/** Inspection issues reads only, including on a completely empty database. */
export function inspectMigrations(raw: Database.Database, installed: readonly Migration[], history: readonly Migration[] = []): MigrationPlan {
  const plan: MigrationPlan = { formatVersion: 1, status: 'blocked', database: '', digest: '', materialsDigest: '', namespaces: [], applied: [], steps: [], reasons: [] };
  let schema: unknown[] = [], material: MigrationStep[] = [], retained: MigrationStep[] = [];
  try {
    plan.database = databaseLocation(raw);
    schema = raw.prepare("SELECT type, name, tbl_name, sql FROM main.sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name").all();
    if ((raw.prepare("SELECT name FROM temp.sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all()).length) throw new MigrationError('DATABASE_UNAVAILABLE', 'Temporary schema objects are not supported by migration inspection');
    const integrity = raw.pragma('main.integrity_check') as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new MigrationError('DATABASE_CORRUPT', 'Database integrity check failed');
    plan.applied = readLedger(raw, schema as Parameters<typeof readLedger>[1]);
    checkForeignKeys(raw);
    material = normalize(installed); retained = normalize(history);
    const available = new Map(material.map(step => [key(step), step]));
    const archived = new Map(retained.map(step => [key(step), step]));
    const targets = new Map<string, MigrationStep>();
    for (const step of material) targets.set(step.namespace, step);
    if (retained.some(step => targets.has(step.namespace))) throw new MigrationError('INVALID_MANIFEST', 'Installed and retained migration materials must not overlap');
    const current = new Map<string, number>();
    for (const row of plan.applied) current.set(row.namespace, row.revision);
    plan.namespaces = [...new Set([...targets.keys(), ...current.keys()])].sort().map(namespace => ({ namespace,
      currentRevision: current.get(namespace) ?? 0, targetRevision: targets.get(namespace)?.revision ?? null,
      packageVersion: targets.get(namespace)?.packageVersion ?? null }));
    for (const row of plan.applied) {
      const target = targets.get(row.namespace);
      if (target && row.revision > target.revision) throw new MigrationError('VERSION_UNSUPPORTED', 'Data revision is newer than installed provider', undefined, row);
      const trusted = available.get(key(row)) ?? archived.get(key(row));
      if (target && !trusted) throw new MigrationError('UNVERIFIED_HISTORY', 'Applied migration history cannot be verified', undefined, row);
      if (trusted && trusted.digest !== row.digest) throw new MigrationError('DIGEST_MISMATCH', 'Applied migration checksum changed', undefined, row);
    }
    const verifying = new Set<string>(), verified = new Set<string>();
    const verifyRetainedDependency = (dependency: MigrationKey) => {
      if ((current.get(dependency.namespace) ?? 0) < dependency.revision) throw new MigrationError('MISSING_DEPENDENCY', 'Missing installed migration dependency or committed retained revision', undefined, dependency);
      for (let revision = 1; revision <= dependency.revision; revision++) {
        const id = key({ ...dependency, revision }), step = archived.get(id);
        if (!step) throw new MigrationError('UNVERIFIED_HISTORY', 'Retained dependency needs verifiable historical material', undefined, dependency);
        if (verifying.has(id)) throw new MigrationError('CYCLIC_DEPENDENCY', 'Cyclic retained migration dependency', undefined, step);
        if (verified.has(id)) continue;
        verifying.add(id);
        for (const prerequisite of step.dependencies) {
          if (targets.has(prerequisite.namespace)) {
            if (!available.has(key(prerequisite)) || prerequisite.revision > (current.get(prerequisite.namespace) ?? 0)) {
              throw new MigrationError('MISSING_DEPENDENCY', 'Retained history has an unverified committed dependency', undefined, step);
            }
          } else verifyRetainedDependency(prerequisite);
        }
        verifying.delete(id); verified.add(id);
      }
    };
    for (const step of material) {
      for (const dependency of step.dependencies) {
        if (!targets.has(dependency.namespace)) verifyRetainedDependency(dependency);
        else if (!available.has(key(dependency))) throw new MigrationError('MISSING_DEPENDENCY', 'Missing dependency revision in installed history', undefined, step);
        if (step.revision <= (current.get(step.namespace) ?? 0) && dependency.revision > (current.get(dependency.namespace) ?? 0)) {
          throw new MigrationError('INVALID_LEDGER', 'Applied step has an unapplied dependency', undefined, step);
        }
      }
    }
    // Historical edges are included too: an installed/retained cycle cannot become a terminal dependency.
    for (const step of retained) {
      for (const dependency of step.dependencies) {
        if (!available.has(key(dependency)) && !archived.has(key(dependency))) throw new MigrationError('UNVERIFIED_HISTORY', 'Retained history has a dependency without trusted material', undefined, step);
        if (step.revision <= (current.get(step.namespace) ?? 0) && dependency.revision > (current.get(dependency.namespace) ?? 0)) {
          throw new MigrationError('INVALID_LEDGER', 'Retained committed step has an unapplied dependency', undefined, step);
        }
      }
    }
    const remaining = [...material, ...retained].sort(compare), complete = new Set<string>(), ordered: MigrationStep[] = [];
    while (remaining.length) {
      const at = remaining.findIndex(step => step.dependencies.every(dep => complete.has(key(dep))));
      if (at < 0) throw new MigrationError('CYCLIC_DEPENDENCY', 'Cyclic migration dependency');
      const step = remaining.splice(at, 1)[0]!; complete.add(key(step)); ordered.push(step);
    }
    plan.steps = ordered.filter(step => targets.has(step.namespace) && step.revision > (current.get(step.namespace) ?? 0));
    plan.status = !schema.length ? 'empty' : plan.steps.length ? 'upgrade-required' : 'compatible';
    if (plan.status === 'upgrade-required') plan.reasons.push({ code: 'UPGRADE_REQUIRED', message: 'Existing database requires explicitly confirmed maintenance and a recovery point' });
  } catch (error) {
    const failure = databaseFailure(error);
    plan.status = 'blocked'; plan.steps = [];
    plan.reasons.push({ code: failure.code, message: failure.message, ...(failure.step ? { step: { namespace: failure.step.namespace, revision: failure.step.revision } } : {}) });
  }
  plan.materialsDigest = checksum(JSON.stringify({ material, retained }));
  plan.digest = checksum(JSON.stringify({ version: 1, database: plan.database, schema, applied: plan.applied, material, retained,
    status: plan.status, reasons: plan.reasons }));
  return plan;
}
