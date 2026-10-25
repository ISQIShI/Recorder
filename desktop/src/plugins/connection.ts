import type { Context } from '@deepseek-ai/cordis';
import { ipcMain } from 'electron';
import { parseFoundationStatus } from '@recorder/contracts';
import '../contracts.js';
export const inject = ['recorderWindow'];
export function apply(ctx: Context, config: { rendererUrl: string; backendUrl: string }) {
  const base = new URL(config.backendUrl);
  if (base.hostname !== '127.0.0.1' || base.protocol !== 'http:' || base.username || base.password) {
    throw new Error('Foundation connection is restricted to local loopback');
  }
  ctx.effect(() => {
    const controller = new AbortController();
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
    return () => { ipcMain.removeHandler('recorder:foundation-status'); controller.abort(); };
  });
}
