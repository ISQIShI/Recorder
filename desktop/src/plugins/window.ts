import type { Context } from '@deepseek-ai/cordis';
import { BrowserWindow } from 'electron';
import '../contracts.js';
export function apply(ctx: Context, config: { preload: string; hidden?: boolean }) {
  ctx.effect(() => {
    const window = new BrowserWindow({
      width: 1100, height: 760, show: !config.hidden, title: 'Recorder · 工程验证',
      backgroundColor: '#111724',
      webPreferences: { preload: config.preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    ctx.provide('recorderWindow', window);
    return () => { if (!window.isDestroyed()) window.destroy(); };
  });
}
