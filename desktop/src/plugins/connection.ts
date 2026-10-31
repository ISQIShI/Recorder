import type { Context } from '@deepseek-ai/cordis';
import { ipcMain } from 'electron';
import { parseFoundationStatus, encodeApiRequest, isApiMethod, parseApiResponse, attachmentUploadPath, attachmentContentPath, fileRecordUploadPath, ApiError } from '@recorder/contracts';
import './credentials.js';
import '../contracts.js';
export const inject = ['recorderWindow', 'recorderCredentials'];
export async function apply(ctx: Context, config: { rendererUrl: string; backendUrl: string }) {
  const base = new URL(config.backendUrl);
  if (base.hostname !== '127.0.0.1' || base.protocol !== 'http:' || base.username || base.password) {
    throw new Error('Foundation connection is restricted to local loopback');
  }
  let token: string | undefined;
  try { token = await ctx.recorderCredentials.load(base.href); } catch { /* Login can replace credentials that this system cannot decrypt. */ }
  ctx.effect(() => {
    const controller = new AbortController();
    const sessions = new Set<() => void>();
    const setToken = (value?: string) => { if (value !== token) { token = value; for (const listener of sessions) listener(); } };
    function assertSender(event: import('electron').IpcMainInvokeEvent) {
      if (event.sender !== ctx.recorderWindow.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== config.rendererUrl) throw new ApiError('INVALID_SENDER', '调用来源不受信任', 403);
    }
    ipcMain.handle('recorder:api', async (event, method: unknown, input: unknown) => {
      try {
        assertSender(event);
        if (!isApiMethod(method) || !input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 220000) throw new ApiError('INVALID_REQUEST', '调用格式不正确', 400);
        const values = input as Record<string, unknown>;
        const request = encodeApiRequest(method, values);
        const url = new URL(request.path, base);
        const response = await fetch(url, { ...request, redirect: 'error',
          headers: { 'content-type': 'application/json', 'x-recorder-request': '1', 'x-recorder-client': 'native', ...(token ? { authorization: 'Bearer ' + token } : {}) },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const body = await response.json() as any;
        if (response.status === 401 || response.headers.get('x-recorder-clear-session')) { setToken(); await ctx.recorderCredentials.save(base.href); }
        if (!response.ok) throw new ApiError(body.code ?? 'REQUEST_FAILED', body.message ?? '请求失败', response.status);
        const issued = response.headers.get('x-recorder-session');
        if (issued) { setToken(issued); await ctx.recorderCredentials.save(base.href, values.remember ? issued : undefined); }
        return { ok: true, value: parseApiResponse(method, body) };
      } catch (error) {
        return { ok: false, error: { code: error instanceof ApiError ? error.code : 'CONNECTION_FAILED', message: error instanceof Error ? error.message : '连接失败', status: error instanceof ApiError ? error.status : 503 } };
      }
    });
    ipcMain.handle('recorder:foundation-status', async (event) => {
      if (event.sender !== ctx.recorderWindow.webContents || event.senderFrame !== event.sender.mainFrame
        || event.senderFrame.url !== config.rendererUrl) throw new Error('Invalid IPC sender');
      const response = await fetch(new URL('/api/v1/plugins/foundation/operations/status', base), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Backend unavailable');
      return parseFoundationStatus(await response.json());
    });
    ctx.provide('recorderDesktopConnection', { ready: true, assertSender,
      onSessionChange(listener) { sessions.add(listener); return () => { sessions.delete(listener); }; },
      async file(input, body, signal) {
        if (!token) throw new ApiError('UNAUTHORIZED', '请先登录', 401);
        const path = input.kind === 'createRecord' ? fileRecordUploadPath(input.uploadId!) : input.kind === 'upload' ? attachmentUploadPath(input.id, input.uploadId!) : attachmentContentPath(input.id);
        const upload = input.kind !== 'download';
        const response = await fetch(new URL(path, base), { method: upload ? 'PUT' : 'GET', redirect: 'error', credentials: 'omit',
          headers: { 'x-recorder-request': '1', 'x-recorder-client': 'native', authorization: 'Bearer ' + token, ...(upload ? { 'content-type': 'application/octet-stream', 'content-length': String(input.bytes), 'x-recorder-filename': encodeURIComponent(input.name!) } : {}) },
          ...(body ? { body: body as any, duplex: 'half' } : {}), signal: AbortSignal.any([controller.signal, signal]) } as RequestInit);
        if (response.status === 401) { setToken(); await ctx.recorderCredentials.save(base.href); }
        if (!response.ok) { const error = await response.json() as any; throw new ApiError(error.code ?? 'FILE_TRANSFER_FAILED', error.message ?? '文件传输失败', response.status); }
        return response;
      },
    });
    return () => { ipcMain.removeHandler('recorder:foundation-status'); ipcMain.removeHandler('recorder:api'); setToken(); sessions.clear(); controller.abort(); };
  });
}
