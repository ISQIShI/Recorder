import { lstatSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { syncDirectory, writePrivate } from './recovery-files.js';

export const runId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function exists(path: string) {
  try { lstatSync(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
/** Atomic private metadata publication. Failed/interrupted temporary writes remain available. */
export function publish(directory: string, filename: string, value: unknown) {
  const temporary = join(directory, '.pending-' + filename + '-' + randomUUID());
  writePrivate(temporary, JSON.stringify(value, null, 2));
  renameSync(temporary, join(directory, filename)); syncDirectory(directory);
}
