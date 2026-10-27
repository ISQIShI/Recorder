import { and, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import type { RecordData, RecordState } from '@recorder/contracts';
import { records } from './records-schema.js';

// Shared SQL semantics, independent of any service provider or optional plugin.
export function recordSelection(ownerId: string, q: string, state: RecordState = 'active') {
  return and(eq(records.ownerId, ownerId), state === 'trash' ? isNotNull(records.deletedAt) : isNull(records.deletedAt),
    q ? sql`instr(lower(${records.title} || char(10) || ${records.body}), lower(${q})) > 0` : undefined);
}
export function exposeRecord(row: typeof records.$inferSelect): RecordData {
  const { ownerId: _owner, requestHash: _hash, ...record } = row;
  return record;
}
