import type { Context } from '@deepseek-ai/cordis';
import { writeFile } from 'node:fs/promises';
import './contracts.js';

export async function runDesktopSmoke(ctx: Context) {
  const contents = ctx.recorderWindow.webContents;
  const check = (expression: string) => contents.executeJavaScript(expression) as Promise<boolean>;
  async function until(expression: string) {
    const deadline = Date.now() + 15000;
    while (!(await check(expression))) {
      if (Date.now() > deadline) throw new Error('Desktop smoke timed out: ' + expression);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  await until("Boolean(document.querySelector('[data-panel=sample]'))");
  await until("document.querySelector('[data-status]')?.textContent.includes('后端已连接')");
  await contents.executeJavaScript("document.querySelector('[data-toggle-plugin]').click()");
  await until("!document.querySelector('[data-panel=sample]')");
  await contents.executeJavaScript("document.querySelector('[data-toggle-plugin]').click()");
  await until("document.querySelectorAll('[data-panel=sample]').length === 1");
  const sandboxed = await check("typeof window.require === 'undefined' && typeof window.recorder.status === 'function'");
  if (!sandboxed) throw new Error('Renderer isolation check failed');
  if (process.env.RECORDER_SMOKE_SCREENSHOT) {
    await writeFile(process.env.RECORDER_SMOKE_SCREENSHOT, (await contents.capturePage()).toPNG());
  }
  if (process.env.RECORDER_SMOKE_RESULT) {
    await writeFile(process.env.RECORDER_SMOKE_RESULT, JSON.stringify({ passed: true, backend: true, uiLifecycle: true, isolation: true }));
  }
  console.log('RECORDER_DESKTOP_SMOKE_OK: backend IPC, Vue mount, plugin removal/reload, renderer isolation');
}
