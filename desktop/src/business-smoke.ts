import type { Context } from '@deepseek-ai/cordis';
import { app, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import './contracts.js';

export async function runBusinessSmoke(ctx: Context) {
  const contents = ctx.recorderWindow.webContents;
  const evaluate = (source: string) => contents.executeJavaScript(source, true);
  const scenario = process.env.RECORDER_SMOKE_SCENARIO ?? (process.env.RECORDER_SMOKE_RESUME === '1' ? 'resume' : 'create');
  const checks: string[] = [];
  async function until(source: string) {
    const deadline = Date.now() + 20000;
    while (!await evaluate(source)) {
      if (Date.now() > deadline) throw new Error('Business UI smoke timeout: ' + source + '\n' + await evaluate('document.body.innerText'));
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }
  const click = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  async function fill(name: string, value: string) {
    await evaluate(`(() => { const input = document.querySelector('[name="${name}"]'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  const invoke = (method: string, input: object) => evaluate(`window.recorder.invokeApi(${JSON.stringify(method)}, ${JSON.stringify(input)})`);
  const editorReady = () => until("Boolean(document.querySelector('[data-editor]')) && !document.querySelector('[data-editor] fieldset').disabled");
  const saved = () => until("document.querySelector('[data-editor-message]')?.textContent === '已保存到后端' && !document.querySelector('[data-editor] fieldset').disabled");
  const result = async () => {
    if (!await evaluate("typeof window.require === 'undefined' && typeof window.recorder.invokeApi === 'function'")) throw new Error('Renderer isolation failed');
    await writeFile(process.env.RECORDER_SMOKE_RESULT!, JSON.stringify({ passed: true, scenario, checks }));
  };

  if (scenario === 'create') {
    await until("Boolean(document.querySelector('[name=setupCode]'))");
    await fill('setupCode', process.env.RECORDER_SMOKE_SETUP_CODE!);
    await fill('username', 'smoke-owner'); await fill('password', 'Recorder smoke password 2026!');
    await click('[data-login-submit]'); await until("Boolean(document.querySelector('[data-signed-in]'))");
    await fill('recordTitle', '第一条记录'); await fill('recordBody', '# 保存验证\n这条内容需要在重启后仍然可查询。');
    await evaluate("(() => { const field = document.querySelector('[name=recordFormat]'); field.value = 'markdown'; field.dispatchEvent(new Event('change', {bubbles:true})); })()");
    await click('[data-save-record]'); await until("document.querySelector('[data-record-message]')?.textContent === '已保存到后端' && document.querySelectorAll('[data-record-id]').length === 1 && !document.querySelector('[data-search-record]').disabled");
    const id = await evaluate("document.querySelector('[data-record-id]').getAttribute('data-record-id')");
    await click('[data-edit-record]'); await editorReady();
    if (!await evaluate("document.querySelector('[data-save-edit]').disabled")) throw new Error('Unchanged edit must not submit');
    await fill('editTitle', '已编辑的记录'); await fill('editBody', '# 编辑后重启验证\n<script>仅源文</script>');
    await evaluate("(() => { const field = document.querySelector('[name=editFormat]'); field.value = 'plain'; field.dispatchEvent(new Event('change', {bubbles:true})); })()");
    await click('[data-save-edit]'); await saved();
    checks.push('title/body/format manual save, list/detail update, unchanged disabled');
    if (!await evaluate("document.querySelector('[data-record-id] strong').textContent === '已编辑的记录' && document.querySelector('[data-record-revision]').textContent.includes('版本 2')")) throw new Error('List/detail did not update');

    await fill('editBody', '我的冲突草稿（重启验证）');
    const remote = await invoke('updateRecord', { id, expectedRevision: 2, title: '其他客户端', body: '其他客户端的新内容（重启验证）', format: 'markdown' });
    if (!remote.ok) throw new Error('Competing update failed: ' + JSON.stringify(remote));
    await click('[data-save-edit]'); await until("document.querySelector('[data-editor-message]').textContent.includes('版本冲突')");
    await click('[data-latest-record]'); await until("Boolean(document.querySelector('[data-latest]'))");
    if (!await evaluate("document.querySelector('[name=editBody]').value === '我的冲突草稿（重启验证）' && document.querySelector('[data-editor-dirty]').textContent.includes('版本 2') && document.querySelector('[data-latest-body]').textContent.includes('其他客户端')")) throw new Error('Conflict lost draft or silently rebased');
    await click('[data-keep-draft]'); await click('[data-latest-record]'); await until("Boolean(document.querySelector('[data-latest]'))");
    await click('[data-rebase-edit]'); await click('[data-save-edit]'); await saved();
    checks.push('real 409, latest comparison preserves draft/revision, explicit rebase then manual save');

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (url: any, init?: RequestInit) => init?.method === 'PUT' ? new Response(JSON.stringify({ code: 'PLUGIN_UNAVAILABLE', message: '隔离服务失败样本' }), { status: 503 }) : originalFetch(url, init)) as typeof fetch;
      await fill('editBody', '服务失败仍保留草稿'); await click('[data-save-edit]');
      await until("document.querySelector('[data-editor-message]').textContent === '隔离服务失败样本'");
      if (!await evaluate("document.querySelector('[name=editBody]').value === '服务失败仍保留草稿'")) throw new Error('Error lost draft');
    } finally { globalThis.fetch = originalFetch; }
    checks.push('service failure retains in-memory draft');
    await evaluate("window.__confirmCount = 0; window.confirm = () => { window.__confirmCount++; return false; }; void 0");
    await click('[data-cancel-edit]'); await click('[data-logout]');
    await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === '登录会话').click()");
    await until("Boolean(document.querySelector('.session-row'))");
    await evaluate("Array.from(document.querySelectorAll('.session-row')).find(row => row.textContent.includes('当前会话')).querySelector('button').click()");
    if (!await evaluate("Boolean(document.querySelector('[data-editor]')) && Boolean(document.querySelector('[data-signed-in]')) && window.__confirmCount === 3")) throw new Error('Cancel/logout/revoke guard failed');
    await evaluate("window.confirm = () => true; void 0"); await click('[data-discard-edit]'); await editorReady();
    if (!await evaluate("document.querySelector('[name=editBody]').value === '我的冲突草稿（重启验证）'")) throw new Error('Discard did not load backend');
    await click('[data-cancel-edit]');
    await fill('recordTitle', '第二条记录'); await fill('recordBody', '用于切换确认的独立样本'); await click('[data-save-record]');
    await until("document.querySelectorAll('[data-record-id]').length === 2 && !document.querySelector('[data-search-record]').disabled");
    await click(`[data-record-id="${id}"]`); await until("Boolean(document.querySelector('[data-edit-record]')) && !document.querySelector('[data-edit-record]').disabled"); await click('[data-edit-record]'); await editorReady();
    await fill('editBody', '切换草稿'); await evaluate("window.confirm = () => false; void 0");
    await evaluate(`Array.from(document.querySelectorAll('[data-record-id]')).find(button => button.getAttribute('data-record-id') !== ${JSON.stringify(id)}).click()`);
    if (!await evaluate("document.querySelector('[name=editBody]').value === '切换草稿'")) throw new Error('Switch cancellation lost draft');
    await evaluate("window.confirm = () => true; void 0");
    await evaluate(`Array.from(document.querySelectorAll('[data-record-id]')).find(button => button.getAttribute('data-record-id') !== ${JSON.stringify(id)}).click()`);
    await until("Boolean(document.querySelector('[data-edit-record]')) && !document.querySelector('[data-edit-record]').disabled && !document.querySelector('[data-editor]')");
    await click(`[data-record-id="${id}"]`); await until("Boolean(document.querySelector('[data-edit-record]')) && !document.querySelector('[data-edit-record]').disabled"); await click('[data-edit-record]'); await editorReady();
    await fill('editBody', '正常退出取消后仍可保存（重启验证）');
    const originalDialog = dialog.showMessageBoxSync;
    let prompts = 0;
    try {
      dialog.showMessageBoxSync = (() => { prompts++; return 0; }) as typeof dialog.showMessageBoxSync;
      ctx.recorderWindow.close(); await new Promise(resolve => setTimeout(resolve, 120));
      if (prompts !== 1 || ctx.recorderWindow.isDestroyed()) throw new Error('Dirty window close did not cancel');
      app.quit(); await new Promise(resolve => setTimeout(resolve, 120));
      if (Number(prompts) !== 2 || ctx.recorderWindow.isDestroyed() || !ctx.get('recorderDesktopConnection')) throw new Error('Normal app quit bypassed draft or disposed dependencies');
      await click('[data-save-edit]'); await saved();
      if (Number(prompts) !== 2) throw new Error('Save unexpectedly prompted');
    } finally { dialog.showMessageBoxSync = originalDialog; }
    checks.push('switch/cancel/logout/current-revoke cancellation and discard approval', 'dirty window.close/app.quit cancellation preserves live resources; subsequent save works');
    await click('[data-cancel-edit]');
    await fill('recordQuery', '重启'); await click('[data-search-record]');
    await until("document.querySelectorAll('[data-record-id]').length === 1 && !document.querySelector('[data-search-record]').disabled");
    if (process.env.RECORDER_SMOKE_SCREENSHOT) await writeFile(process.env.RECORDER_SMOKE_SCREENSHOT, (await contents.capturePage()).toPNG());
  } else if (scenario === 'resume') {
    await until("Boolean(document.querySelector('[data-signed-in]'))");
    await until("document.querySelectorAll('[data-record-id]').length === 2");
    const list = await invoke('listRecords', { q: '重启' });
    if (!list.ok || list.value.items[0]?.body !== '正常退出取消后仍可保存（重启验证）' || list.value.items[0]?.revision !== 5) throw new Error('Edited record did not persist across restart');
    checks.push('edited content/revision survives restart; remembered login');
    await click('[data-logout]'); await until("Boolean(document.querySelector('[name=username]'))");
    checks.push('logout revokes persisted session');
  } else {
    await until("Boolean(document.querySelector('[name=username]')) || Boolean(document.querySelector('[data-signed-in]'))");
    if (!await evaluate("Boolean(document.querySelector('[data-signed-in]'))")) {
      await fill('username', 'smoke-owner'); await fill('password', 'Recorder smoke password 2026!'); await click('[data-login-submit]');
    }
    await until("Boolean(document.querySelector('[data-signed-in]')) && document.querySelectorAll('[data-record-id]').length === 2");
    await click('[data-record-id]'); await until("Boolean(document.querySelector('[data-edit-record]')) && !document.querySelector('[data-edit-record]').disabled"); await click('[data-edit-record]'); await editorReady(); await fill('editBody', '即将明确放弃的测试草稿');
    dialog.showMessageBoxSync = (() => 1) as typeof dialog.showMessageBoxSync;
    checks.push('dirty ' + (scenario === 'discard-close' ? 'window close' : 'normal app quit') + ' approved; process exit observed by parent');
    await result();
    if (scenario === 'discard-close') ctx.recorderWindow.close(); else app.quit();
    await new Promise<void>(() => {});
  }
  await result();
}
