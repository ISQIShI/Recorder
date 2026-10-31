import type { Context } from '@deepseek-ai/cordis';
import { dialog, ipcMain } from 'electron';
import { createReadStream, createWriteStream, statSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ApiError, MAX_ATTACHMENT_BYTES, isAttachment, isFileRecord, type FileProgress, type ChosenFile, type ApiWireResult } from '@recorder/contracts';
import '../contracts.js';
export const inject = ['recorderWindow', 'recorderDesktopConnection'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function apply(ctx: Context, config: { idleTimeoutMs?: number } = {}) {
  ctx.effect(() => {
    const connection = ctx.recorderDesktopConnection, handles = new Map<string, ChosenFile & { path: string; modified: number }>(), transfers = new Map<string, AbortController>(), tasks = new Set<Promise<unknown>>();
    let active = true, generation = 0;
    const clear = () => { generation++; for (const transfer of transfers.values()) transfer.abort(); handles.clear(); };
    const stopSession = connection.onSessionChange(clear);
    function sync(path: string) { const fd = openSync(path, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); } }
    const notifications = new Map<string, number>();
    function progress(value: FileProgress) { const now = Date.now(); if (value.bytes !== value.total && now - (notifications.get(value.id) ?? 0) < 100) return; notifications.set(value.id, now); if (active && !ctx.recorderWindow.webContents.isDestroyed()) ctx.recorderWindow.webContents.send('recorder:file-progress', value); }
    async function operation(method: unknown, input: any) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 2000 || !['choose', 'upload', 'createRecord', 'save', 'cancel', 'clear'].includes(String(method))) throw new ApiError('INVALID_REQUEST', '文件操作格式不正确', 400);
      const keys: Record<string, string[]> = { choose: [], upload: ['handle', 'recordId', 'uploadId', 'transferId'], createRecord: ['handle', 'uploadId', 'transferId'], save: ['id', 'transferId'], cancel: ['transferId'], clear: [] };
      if (Object.keys(input).some(key => !keys[String(method)]!.includes(key))) throw new ApiError('INVALID_REQUEST', '不接受路径或其他额外输入', 400);
      if (method === 'clear') { clear(); return true; }
      if (method === 'cancel') { if (uuid.test(input.transferId)) transfers.get(input.transferId)?.abort(); return true; }
      if (method === 'choose') {
        const version = generation;
        const result = await dialog.showOpenDialog(ctx.recorderWindow, { title: '选择要复制到 Recorder 的附件', properties: ['openFile'] });
        if (!active || version !== generation || result.canceled || !result.filePaths[0]) return undefined;
        const path = result.filePaths[0], stat = statSync(path); if (!stat.isFile() || stat.size > MAX_ATTACHMENT_BYTES) throw new ApiError('FILE_TOO_LARGE', '请选择不超过 1 GiB 的普通文件', 400);
        const file = { handle: randomUUID(), name: basename(path), bytes: stat.size }; handles.clear(); handles.set(file.handle, { ...file, path, modified: stat.mtimeMs }); return file;
      }
      const upload = method === 'upload' || method === 'createRecord';
      if (!uuid.test(input.transferId) || transfers.has(input.transferId) || !(upload ? (method === 'createRecord' || uuid.test(input.recordId)) && uuid.test(input.uploadId) && uuid.test(input.handle) : uuid.test(input.id))) throw new ApiError('INVALID_REQUEST', '文件操作标识不正确', 400);
      const controller = new AbortController(); transfers.set(input.transferId, controller); let lastProgress = Date.now(), choosingTarget = false;
      const idle = setInterval(() => { if (!choosingTarget && Date.now() - lastProgress > (config.idleTimeoutMs ?? 120000)) controller.abort(new Error('文件传输长时间没有进度，结果尚未确认')); }, 1000); idle.unref();
      let temporary: string | undefined;
      try {
        if (upload) {
          const file = handles.get(input.handle); if (!file) throw new ApiError('HANDLE_EXPIRED', '文件选择已失效，请重新选择', 400);
          const stat = statSync(file.path); if (!stat.isFile() || stat.size !== file.bytes || stat.mtimeMs !== file.modified) throw new ApiError('FILE_CHANGED', '原文件已变化，请重新选择', 409);
          let bytes = 0;
          const source = createReadStream(file.path, { signal: controller.signal });
          const counted = source.pipe(new Transform({ transform(chunk, _e, done) { bytes += chunk.length; lastProgress = Date.now(); progress({ id: input.transferId, phase: 'upload', bytes, total: file.bytes }); done(null, chunk); } }));
          source.on('error', error => counted.destroy(error));
          // Fetch may reject before it starts consuming the body (or on cancellation).
          // Keep both stream errors observed and stop reading the selected file then.
          counted.on('error', () => source.destroy());
          const response = await connection.file({ kind: method === 'createRecord' ? 'createRecord' : 'upload', id: input.recordId ?? '', uploadId: input.uploadId, name: file.name, bytes: file.bytes }, counted, controller.signal);
          const body = await response.json(); if (!(method === 'createRecord' ? isFileRecord(body) : isAttachment(body))) throw new ApiError('INVALID_RESPONSE', '上传结果尚未确认，请刷新记录或重试同一次上传', 502);
          return body;
        }
        const response = await connection.file({ kind: 'download', id: input.id }, undefined, controller.signal);
        const bytesExpected = Number(response.headers.get('content-length')), expected = response.headers.get('x-recorder-digest');
        if (!response.body || !response.headers.has('content-length') || !Number.isSafeInteger(bytesExpected) || bytesExpected < 0 || bytesExpected > MAX_ATTACHMENT_BYTES || !expected || !/^[a-f0-9]{64}$/.test(expected)) { await response.body?.cancel(); throw new ApiError('INVALID_RESPONSE', '下载元数据不正确', 502); }
        let name = 'attachment'; try { name = decodeURIComponent(response.headers.get('content-disposition')?.split("filename*=UTF-8''")[1] ?? name); } catch { /* Safe default for malformed names. */ }
        choosingTarget = true;
        const result = await dialog.showSaveDialog(ctx.recorderWindow, { title: '附件另存为', defaultPath: name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'attachment', properties: ['showOverwriteConfirmation'] });
        choosingTarget = false;
        if (result.canceled || !result.filePath) { controller.abort(); await response.body.cancel().catch(() => {}); return false; }
        controller.signal.throwIfAborted(); lastProgress = Date.now();
        temporary = join(dirname(result.filePath), '.recorder-save-' + randomUUID() + '.part'); let bytes = 0; const hash = createHash('sha256');
        await pipeline(Readable.fromWeb(response.body as any), new Transform({ transform(chunk, _e, done) { bytes += chunk.length; if (bytes > bytesExpected) { done(new Error('下载字节超过声明大小')); return; } hash.update(chunk); lastProgress = Date.now(); progress({ id: input.transferId, phase: 'download', bytes, total: bytesExpected }); done(null, chunk); } }), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal: controller.signal });
        if (bytes !== bytesExpected || hash.digest('hex') !== expected) throw new ApiError('DIGEST_MISMATCH', '文件下载不完整，原目标文件保留', 502);
        controller.signal.throwIfAborted(); sync(temporary); renameSync(temporary, result.filePath); temporary = undefined;
        return true;
      } finally { clearInterval(idle); controller.abort(); transfers.delete(input.transferId); notifications.delete(input.transferId); if (temporary) await unlink(temporary).catch(() => {}); }
    }
    ipcMain.handle('recorder:files', (event, method, input) => {
      const task = (async (): Promise<ApiWireResult> => { try { connection.assertSender(event); return { ok: true, value: await operation(method, input) }; } catch (error) { return { ok: false, error: { code: error instanceof ApiError ? error.code : 'FILE_TRANSFER_FAILED', message: error instanceof ApiError ? error.message : '文件传输失败或已取消；上传结果可能未确认，请刷新附件，或重试同一次上传。', status: error instanceof ApiError ? error.status : 503 } }; } })();
      tasks.add(task); void task.finally(() => tasks.delete(task)); return task;
    });
    return async () => { active = false; stopSession(); clear(); ipcMain.removeHandler('recorder:files'); await Promise.allSettled([...tasks]); };
  });
}
