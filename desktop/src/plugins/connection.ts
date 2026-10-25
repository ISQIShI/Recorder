import type { Context } from '@deepseek-ai/cordis';
import { ipcMain } from 'electron';
import { parseFoundationStatus, apiRoutes, isApiMethod, parseApiResponse, ApiError } from '@recorder/contracts';
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
    ipcMain.handle('recorder:api', async (event, method: unknown, input: unknown) => {
      try {
        if (event.sender !== ctx.recorderWindow.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== config.rendererUrl) throw new ApiError('INVALID_SENDER', '调用来源不受信任', 403);
        if (!isApiMethod(method) || !input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 220000) throw new ApiError('INVALID_REQUEST', '调用格式不正确', 400);
        const values = input as Record<string, unknown>;
        const route = apiRoutes[method];
        const url = new URL(route.path.replace(':id', encodeURIComponent(String(values.id ?? ''))), base);
        if (route.method === 'GET' && method !== 'getRecord') for (const [key, value] of Object.entries(values)) url.searchParams.set(key, String(value));
        const response = await fetch(url, { method: route.method, redirect: 'error',
          headers: { 'content-type': 'application/json', 'x-recorder-request': '1', 'x-recorder-client': 'native', ...(token ? { authorization: 'Bearer ' + token } : {}) },
          ...(route.method === 'POST' ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const body = await response.json() as any;
        if (response.status === 401 || response.headers.get('x-recorder-clear-session')) { token = undefined; await ctx.recorderCredentials.save(base.href); }
        if (!response.ok) throw new ApiError(body.code ?? 'REQUEST_FAILED', body.message ?? '请求失败', response.status);
        const issued = response.headers.get('x-recorder-session');
        if (issued) { token = issued; await ctx.recorderCredentials.save(base.href, values.remember ? issued : undefined); }
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
    ctx.provide('recorderDesktopConnection', { ready: true });
    return () => { ipcMain.removeHandler('recorder:foundation-status'); ipcMain.removeHandler('recorder:api'); token = undefined; controller.abort(); };
  });
}
