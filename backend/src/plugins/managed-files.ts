import type { Context } from '@deepseek-ai/cordis';
import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, lstatSync, mkdirSync, mkdtempSync, renameSync, existsSync, statfsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_ATTACHMENT_BYTES, type AttachmentData } from '@recorder/contracts';
import { failure, StorageError } from '../domain.js';
import type { ManagedFiles, ManagedObject } from '../attachments-contract.js';
import { privateDirectory, syncFile, syncDirectory, fileDigest } from './recovery-files.js';
import { regularFile } from './storage-path.js';
export const inject = ['recorderDatabaseOwnership', 'recorderDatabase'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Row = { id: string; owner_id: string; record_id: string | null; object_id: string; name: string; media_type: string; state: string; bytes: number | null; digest: string | null; created_at: number; error: string | null };
const exposed = (r: Row): AttachmentData => ({ id: r.id, name: r.name, mediaType: r.media_type, bytes: r.bytes!, digest: r.digest!, state: r.state as AttachmentData['state'], createdAt: r.created_at, error: r.error });
export function apply(ctx: Context, config: { maxBytes?: number } = {}) {
  const database = ctx.recorderDatabase, raw = database.raw, controller = new AbortController(), inflight = new Set<string>(), reading = new Map<string, number>();
  const max = config.maxBytes ?? MAX_ATTACHMENT_BYTES;
  let directory: string | undefined, cleaning: Promise<void> | undefined;
  function assertActive() { if (controller.signal.aborted) throw new StorageError('SERVICE_WITHDRAWN', 'Managed-file storage provider was withdrawn'); ctx.recorderDatabaseOwnership.assertHeld(); }
  function root() {
    if (!directory) {
      directory = ctx.recorderDatabaseOwnership.filename === ':memory:' ? mkdtempSync(join(tmpdir(), 'recorder-managed-')) : ctx.recorderDatabaseOwnership.filename + '.files';
      privateDirectory(directory); for (const name of ['objects', 'pending']) { const path = join(directory, name); if (!existsSync(path)) mkdirSync(path, { mode: 0o700 }); if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw failure(500, 'STORAGE_UNSAFE', '托管目录不可用'); }
    }
    return directory;
  }
  function path(id: string, pending = false) { if (!uuid.test(id)) throw failure(500, 'STORAGE_INVALID', '托管对象标识损坏'); return join(root(), pending ? 'pending' : 'objects', id); }
  const hasTable = (db = raw) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='attachments_objects'").get();
  function row(owner: string, id: string) { const r = raw.prepare('SELECT * FROM attachments_objects WHERE owner_id=? AND id=?').get(owner, id) as Row | undefined; if (!r) throw failure(404, 'NOT_FOUND', '附件不存在'); return r; }
  async function discard(r: Row, reserved = false) {
    if ((!reserved && inflight.has(r.id)) || reading.has(r.object_id)) return;
    raw.prepare("UPDATE attachments_objects SET state='deleting' WHERE id=?").run(r.id);
    try {
      for (const pending of [true, false]) { const p = path(r.object_id, pending); try { regularFile(p); await unlink(p); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } }
      syncDirectory(join(root(), 'objects')); syncDirectory(join(root(), 'pending'));
      raw.prepare("UPDATE attachments_objects SET state='deleted',error=NULL WHERE id=?").run(r.id);
    } catch { raw.prepare("UPDATE attachments_objects SET error='FILE_CLEANUP_FAILED' WHERE id=?").run(r.id); }
  }
  const service: ManagedFiles = {
    get root() { assertActive(); return root(); },
    recordId(owner, id) { assertActive(); return row(owner, id).record_id; },
    list(owner, recordId) { assertActive(); return (raw.prepare("SELECT * FROM attachments_objects WHERE owner_id=? AND record_id=? AND (state='ready' OR (state='deleting' AND digest IS NOT NULL)) ORDER BY created_at,id").all(owner, recordId) as Row[]).map(exposed); },
    get(owner, id) { assertActive(); const r = row(owner, id); if (r.state !== 'ready' || !r.record_id) throw failure(404, 'NOT_FOUND', '附件不存在或正在删除'); return { ...exposed(r), recordId: r.record_id }; },
    receive(input, stream, validate, signal) { return database.use(async () => {
      const combined = AbortSignal.any([signal, controller.signal]); combined.throwIfAborted(); validate();
      if (inflight.has(input.id)) throw failure(409, 'UPLOAD_IN_PROGRESS', '同一次上传尚在进行');
      const previous = raw.prepare('SELECT * FROM attachments_objects WHERE id=?').get(input.id) as Row | undefined;
      if (previous && (previous.owner_id !== input.owner || previous.record_id !== input.recordId || previous.name !== input.name || previous.media_type !== input.mediaType)) throw failure(409, 'IDEMPOTENCY_CONFLICT', '此上传标识已用于其他内容');
      if (previous?.state === 'deleting' || (previous?.state === 'deleted' && previous.digest)) throw failure(409, 'UPLOAD_REMOVED', '此上传已被删除；请重新选择文件');
      // Reserve before the first asynchronous cleanup, so concurrent retries cannot
      // replace this request's object identity while it is publishing bytes.
      inflight.add(input.id);
      try {
        if (previous && previous.state !== 'ready') { await discard(previous, true); if (row(input.owner, input.id).state !== 'deleted') throw failure(503, 'FILE_CLEANUP_FAILED', '旧上传材料清理失败，请稍后重试'); }
        const objectId = randomUUID(), hash = createHash('sha256'); let bytes = 0;
        const count = new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length; if (bytes > max) { done(failure(413, 'FILE_TOO_LARGE', '附件超过单文件上限')); return; } hash.update(chunk); done(null, chunk); } });
        const ready = previous?.state === 'ready';
        if (!ready) raw.prepare("INSERT INTO attachments_objects(id,owner_id,record_id,object_id,name,media_type,state,created_at) VALUES(?,?,?,?,?,?,'pending',?) ON CONFLICT(id) DO UPDATE SET object_id=excluded.object_id,state='pending',error=NULL,bytes=NULL,digest=NULL").run(input.id, input.owner, input.recordId, objectId, input.name, input.mediaType, Date.now());
        try {
          if (ready) await pipeline(stream, count, new Writable({ write(_chunk, _e, done) { done(); } }), { signal: combined });
          else await pipeline(stream, count, createWriteStream(path(objectId, true), { flags: 'wx', mode: 0o600 }), { signal: combined });
          combined.throwIfAborted(); const digest = hash.digest('hex');
          if (ready) { validate(); if (bytes !== previous.bytes || digest !== previous.digest) throw failure(409, 'IDEMPOTENCY_CONFLICT', '重复上传内容不一致'); const current = row(input.owner, input.id); if (current.state !== 'ready') throw failure(409, 'UPLOAD_REMOVED', '此上传已被删除；请刷新附件'); return exposed(current); }
          syncFile(path(objectId, true)); renameSync(path(objectId, true), path(objectId)); syncDirectory(join(root(), 'objects')); syncDirectory(join(root(), 'pending'));
          raw.transaction(() => { combined.throwIfAborted(); validate(); raw.prepare("UPDATE attachments_objects SET bytes=?,digest=?,state='ready' WHERE id=?").run(bytes, digest, input.id); }).immediate();
          return exposed(row(input.owner, input.id));
        } catch (error) {
          if (!ready) await discard(row(input.owner, input.id), true);
          throw error;
        }
      } finally { inflight.delete(input.id); }
    }); },
    download(owner, id) {
      assertActive();
      const r = row(owner, id); service.get(owner, id); const p = path(r.object_id); const stat = regularFile(p);
      if (Number(stat.size) !== r.bytes) throw failure(500, 'FILE_MISSING', '附件文件缺失或大小不符');
      const stream = createReadStream(p, { signal: controller.signal }); reading.set(r.object_id, (reading.get(r.object_id) ?? 0) + 1);
      stream.once('close', () => { const n = reading.get(r.object_id)! - 1; if (n) reading.set(r.object_id, n); else reading.delete(r.object_id); });
      return stream;
    },
    async remove(owner, id, validate) {
      assertActive();
      const r = raw.transaction(() => { validate(); const r = row(owner, id); if (r.state === 'pending') throw failure(409, 'UPLOAD_IN_PROGRESS', '上传尚未完成，请先取消上传'); if (r.state !== 'deleted') raw.prepare("UPDATE attachments_objects SET state='deleting' WHERE id=?").run(id); return r; }).immediate();
      if (r.state !== 'deleted') await database.use(async () => { await discard(r); });
      const pending = row(owner, id).state !== 'deleted'; return { deleted: !pending, pending };
    },
    cleanup() {
      assertActive();
      if (cleaning) return cleaning;
      if (!hasTable()) return Promise.resolve();
      cleaning = database.use(async () => { for (const r of raw.prepare("SELECT * FROM attachments_objects WHERE state <> 'deleted' AND (state <> 'ready' OR record_id IS NULL)").all() as Row[]) await discard(r); });
      void cleaning.finally(() => { cleaning = undefined; }).catch(() => {}); return cleaning;
    },
    inventory(db: Database.Database) {
      assertActive();
      if (!hasTable(db)) { if (db.prepare("SELECT 1 FROM recorder_migrations WHERE namespace='attachments'").get()) throw new StorageError('RECOVERY_INVALID', 'Attachment schema is missing'); return []; }
      // Only committed, still-associated ready objects are user data, including trashed records.
      const rows = db.prepare("SELECT object_id AS objectId,bytes,digest FROM attachments_objects WHERE state='ready' AND record_id IS NOT NULL ORDER BY object_id").all() as ManagedObject[];
      if (rows.some(r => !uuid.test(r.objectId) || !Number.isSafeInteger(r.bytes) || r.bytes < 0 || !/^[a-f0-9]{64}$/.test(r.digest))) throw new StorageError('RECOVERY_INVALID', 'Invalid attachment inventory');
      return rows;
    },
    async copy(objects, from, to, signal, progress) {
      assertActive(); signal = AbortSignal.any([signal, controller.signal]);
      if (objects.length && statfsSync(to, { bigint: true }).bavail * statfsSync(to, { bigint: true }).bsize < objects.reduce((n, o) => n + BigInt(o.bytes), 0n)) throw new StorageError('RECOVERY_FAILED', 'Insufficient space for managed objects');
      for (const object of objects) {
        signal.throwIfAborted(); if (!uuid.test(object.objectId)) throw new StorageError('RECOVERY_INVALID', 'Invalid object path');
        const source = join(from, object.objectId), target = join(to, object.objectId); regularFile(source);
        const hash = createHash('sha256'); let bytes = 0;
        await pipeline(createReadStream(source), new Transform({ transform(chunk, _e, done) { bytes += chunk.length; hash.update(chunk); progress?.(chunk.length); done(null, chunk); } }), createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal });
        if (bytes !== object.bytes || hash.digest('hex') !== object.digest) throw new StorageError('RECOVERY_INVALID', 'Managed object differs from the committed database'); syncFile(target);
      }
      syncDirectory(to);
    },
    async verify(objects, directory, signal) {
      assertActive(); signal = AbortSignal.any([signal ?? new AbortController().signal, controller.signal]);
      for (const object of objects) { signal?.throwIfAborted(); if (!uuid.test(object.objectId)) throw new StorageError('RECOVERY_INVALID', 'Invalid managed object path'); const p = join(directory, object.objectId); if (Number(regularFile(p).size) !== object.bytes || await fileDigest(p, signal) !== object.digest) throw new StorageError('RECOVERY_INVALID', 'Managed object size or digest mismatch'); }
    },
  };
  ctx.effect(() => () => controller.abort()); ctx.provide('recorderManagedFiles', service);
}
