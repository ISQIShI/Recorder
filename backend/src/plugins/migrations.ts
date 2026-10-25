import type { Context } from '@deepseek-ai/cordis';
import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import '../domain.js';
export const inject = ['recorderDatabase'];
export interface Migration { namespace: string; revision: number; requires: string[]; sql: string }
export function applyMigrations(raw: Database.Database, plan: Migration[]) {
  raw.transaction(() => {
    raw.exec('CREATE TABLE IF NOT EXISTS recorder_migrations (namespace TEXT NOT NULL, revision INTEGER NOT NULL, digest TEXT NOT NULL, applied_at INTEGER NOT NULL, PRIMARY KEY(namespace, revision))');
    const remaining = [...plan];
    const known = new Set<string>();
    for (const step of plan) {
      if (known.has(step.namespace) || step.revision !== 1) throw new Error('Only unique initial namespace migrations are supported in this phase');
      known.add(step.namespace);
      const newer = raw.prepare('SELECT revision FROM recorder_migrations WHERE namespace = ? AND revision > ?').get(step.namespace, step.revision);
      if (newer) throw new Error('Database schema is newer than installed plugin: ' + step.namespace);
    }
    const complete = new Set<string>();
    while (remaining.length) {
      const at = remaining.findIndex(step => step.requires.every(dependency => complete.has(dependency)));
      if (at < 0) throw new Error('Missing or cyclic migration dependency');
      const step = remaining.splice(at, 1)[0]!;
      const digest = createHash('sha256').update(step.sql).digest('hex');
      const previous = raw.prepare<[string, number], { digest: string }>('SELECT digest FROM recorder_migrations WHERE namespace = ? AND revision = ?').get(step.namespace, step.revision);
      if (previous && previous.digest !== digest) throw new Error('Applied migration checksum changed: ' + step.namespace);
      if (!previous) {
        // This first adapter deliberately accepts only generated initialization DDL.
        for (const statement of step.sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) {
          if (!/^CREATE (TABLE|(?:UNIQUE )?INDEX)\s/i.test(statement) || /\b(PRAGMA|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK)\b/i.test(statement)) throw new Error('Unsupported initialization SQL');
          // prepare rejects multiple statements, so a CREATE prefix cannot hide DML.
          raw.prepare(statement).run();
        }
        raw.prepare('INSERT INTO recorder_migrations VALUES (?, ?, ?, ?)').run(step.namespace, step.revision, digest, Date.now());
      }
      complete.add(step.namespace);
    }
    if ((raw.pragma('foreign_key_check') as unknown[]).length) throw new Error('Foreign key check failed');
  }).immediate();
}
export interface MigrationSource { namespace: string; revision: number; requires: string[]; file: string }
export function apply(ctx: Context, config: { sources: MigrationSource[] }) {
  const plan = config.sources.map(({ file, ...step }) => ({ ...step, sql: readFileSync(new URL('../../migrations/' + file, import.meta.url), 'utf8') }));
  applyMigrations(ctx.recorderDatabase.raw, plan);
  ctx.provide('recorderMigrations', { ready: true });
}
