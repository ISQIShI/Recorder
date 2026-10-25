import type { Context } from '@deepseek-ai/cordis';
import { writeFile } from 'node:fs/promises';
import './contracts.js';
export async function runBusinessSmoke(ctx: Context) {
  const contents = ctx.recorderWindow.webContents;
  const evaluate = (source: string) => contents.executeJavaScript(source);
  async function until(source: string) {
    const deadline = Date.now() + 20000;
    while (!await evaluate(source)) {
      if (Date.now() > deadline) throw new Error('Business UI smoke timeout: ' + source + '\n' + await evaluate('document.body.innerText'));
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  }
  async function fill(name: string, value: string) {
    await evaluate(`(() => { const input = document.querySelector('[name="${name}"]'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  if (process.env.RECORDER_SMOKE_RESUME === '1') {
    await until("Boolean(document.querySelector('[data-signed-in]'))");
    await until("document.querySelectorAll('[data-record-id]').length === 1");
    await evaluate("document.querySelector('[data-logout]').click()");
    await until("Boolean(document.querySelector('[name=username]'))");
  } else {
    await until("Boolean(document.querySelector('[name=setupCode]'))");
    await fill('setupCode', process.env.RECORDER_SMOKE_SETUP_CODE!);
    await fill('username', 'smoke-owner');
    await fill('password', 'Recorder smoke password 2026!');
    await evaluate("document.querySelector('[data-login-submit]').click()");
    await until("Boolean(document.querySelector('[data-signed-in]'))");
    await fill('recordTitle', '第一条记录');
    await fill('recordBody', '# 保存验证\n这条内容需要在重启后仍然可查询。');
    await evaluate("(() => { const field = document.querySelector('[name=recordFormat]'); field.value = 'markdown'; field.dispatchEvent(new Event('change', {bubbles:true})); })()");
    await until("!document.querySelector('[data-save-record]').disabled");
    await evaluate("document.querySelector('[data-save-record]').click()");
    await until("document.querySelector('[data-record-message]')?.textContent === '已保存到后端'");
    await fill('recordQuery', '重启');
    await evaluate("document.querySelector('[data-search-record]').click()");
    await until("document.querySelectorAll('[data-record-id]').length === 1 && !document.querySelector('[data-search-record]').disabled");
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    if (process.env.RECORDER_SMOKE_SCREENSHOT) await writeFile(process.env.RECORDER_SMOKE_SCREENSHOT, (await contents.capturePage()).toPNG());
  }
  if (!await evaluate("typeof window.require === 'undefined' && typeof window.recorder.invokeApi === 'function'")) throw new Error('Renderer isolation failed');
  await writeFile(process.env.RECORDER_SMOKE_RESULT!, JSON.stringify({ passed: true, resume: process.env.RECORDER_SMOKE_RESUME === '1' }));
}
