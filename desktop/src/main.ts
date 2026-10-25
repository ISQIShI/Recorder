import { Context } from '@deepseek-ai/cordis';
import { app } from 'electron';
import { fileURLToPath } from 'node:url';
import * as windowPlugin from './plugins/window.js';
import * as connectionPlugin from './plugins/connection.js';
import * as viewPlugin from './plugins/view.js';
import * as shortcutPlugin from './plugins/shortcut.js';
import * as credentialsPlugin from './plugins/credentials.js';

if (process.env.RECORDER_SMOKE_DATA_DIR) app.setPath('userData', process.env.RECORDER_SMOKE_DATA_DIR);

async function start() {
await app.whenReady();
const smoke = process.argv.includes('--smoke');
const businessSmoke = process.argv.includes('--business-smoke');
const ctx = new Context();
let shuttingDown = false;
app.on('before-quit', event => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void ctx.fiber.dispose().finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
try {
  const rendererUrl = new URL('./renderer/index.html' + (smoke ? '?foundation=1' : ''), import.meta.url).href;
  await ctx.plugin(windowPlugin, { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)), hidden: smoke || businessSmoke });
  await ctx.plugin(credentialsPlugin);
  await ctx.plugin(connectionPlugin, { rendererUrl, backendUrl: process.env.RECORDER_BACKEND_URL ?? 'http://127.0.0.1:4317' });
  await ctx.plugin(shortcutPlugin, { enabled: !smoke && !businessSmoke });
  await ctx.plugin(viewPlugin, { rendererUrl });
  if (smoke) {
    const { runDesktopSmoke } = await import('./smoke.js');
    await runDesktopSmoke(ctx);
    app.quit();
  }
  if (businessSmoke) {
    const { runBusinessSmoke } = await import('./business-smoke.js');
    await runBusinessSmoke(ctx);
    app.quit();
  }
} catch (error) { console.error(error); process.exitCode = 1; app.quit(); }
}
// Let Electron finish importing its ESM entry before waiting for app readiness.
void start();
