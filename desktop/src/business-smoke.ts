import type { Context } from '@deepseek-ai/cordis';
import { app, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import './contracts.js';

export async function runBusinessSmoke(ctx: Context) {
  const contents = ctx.recorderWindow.webContents;
  const evaluate = (source: string) => contents.executeJavaScript(source, true);
  const scenario = process.env.RECORDER_SMOKE_SCENARIO ?? (process.env.RECORDER_SMOKE_RESUME === '1' ? 'resume' : 'create');
  const checks: string[] = [];
  let evidence: unknown;
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
    await writeFile(process.env.RECORDER_SMOKE_RESULT!, JSON.stringify({ passed: true, scenario, checks, evidence }));
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
  } else if (scenario === 'trash' || scenario === 'trash-resume') {
    await until("Boolean(document.querySelector('[name=username]')) || Boolean(document.querySelector('[data-signed-in]'))");
    if (!await evaluate("Boolean(document.querySelector('[data-signed-in]'))")) {
      await fill('username', 'smoke-owner'); await fill('password', 'Recorder smoke password 2026!'); await click('[data-login-submit]');
    }
    await until("Boolean(document.querySelector('[data-signed-in]')) && !document.querySelector('[data-search-record]').disabled");
    if (scenario === 'trash') {
      await fill('recordTitle', '回收站验收目标'); await fill('recordBody', '# 回收站原正文');
      await evaluate("(() => { const field = document.querySelector('[name=recordFormat]'); field.value = 'markdown'; field.dispatchEvent(new Event('change', {bubbles:true})); })()");
      await click('[data-save-record]');
      await until("document.querySelector('[data-record-message]').textContent === '已保存到后端' && !document.querySelector('[data-search-record]').disabled");
      const listed = await invoke('listRecords', { q: '回收站验收目标' });
      if (!listed.ok || listed.value.items.length !== 1) throw new Error('Trash sample creation failed');
      const before = listed.value.items[0], id = before.id;
      await click('[data-edit-record]'); await editorReady(); await fill('editBody', '回收操作保护的草稿');
      await evaluate("window.__confirmCount = 0; window.confirm = () => { window.__confirmCount++; return false; }; void 0");
      await click('[data-trash-record]'); await click('[data-open-trash]'); await click('[data-search-record]');
      if (!await evaluate("window.__confirmCount === 3 && document.querySelector('[name=editBody]').value === '回收操作保护的草稿' && document.querySelector('[data-record-state]').getAttribute('data-record-state') === 'active'")) throw new Error('Trash/list navigation bypassed draft guard');
      const stillActive = await invoke('getRecord', { id });
      if (!stillActive.ok || stillActive.value.deletedAt !== null || stillActive.value.revision !== 1) throw new Error('Cancelled trash mutated backend');
      await evaluate("window.confirm = () => true; void 0");
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: any, init?: RequestInit) => String(url).endsWith('/trash') ? new Response(JSON.stringify({ code: 'PLUGIN_UNAVAILABLE', message: '隔离回收失败样本' }), { status: 503 }) : originalFetch(url, init)) as typeof fetch;
        await click('[data-trash-record]'); await until("document.querySelector('[data-editor-message]').textContent === '隔离回收失败样本'");
        if (!await evaluate("document.querySelector('[name=editBody]').value === '回收操作保护的草稿'")) throw new Error('Failed trash lost draft');
      } finally { globalThis.fetch = originalFetch; }
      const remote = await invoke('updateRecord', { id, expectedRevision: 1, title: before.title, body: '# 回收冲突后的后端正文', format: 'markdown' });
      if (!remote.ok) throw new Error('Trash competing update failed');
      await click('[data-trash-record]'); await until("document.querySelector('[data-editor-message]').textContent.includes('版本冲突') && !document.querySelector('[data-search-record]').disabled");
      if (!await evaluate("document.querySelector('[name=editBody]').value === '回收操作保护的草稿' && document.querySelector('[data-editor-dirty]').textContent.includes('版本 1') && document.querySelector('[data-latest]').textContent.includes('版本 2')")) throw new Error('Trash conflict lost baseline/draft or failed to refresh');
      await click('[data-discard-edit]'); await editorReady(); await click('[data-cancel-edit]');
      await click('[data-trash-record]'); await until("document.querySelector('[data-record-message]').textContent.includes('已移入回收站') && !document.querySelector('[data-search-record]').disabled");
      const gone = await invoke('listRecords', { q: '回收站验收目标' }), trashed = await invoke('getRecord', { id });
      if (!gone.ok || gone.value.total !== 0 || !trashed.ok || trashed.value.revision !== 3 || trashed.value.deletedAt === null) throw new Error('Trash did not reach persistent backend');
      evidence = { before, trashed: trashed.value };
      checks.push('real UI trash, default search exclusion, canceled dirty trash/list/search, service failure and stale revision preserve draft');
    } else {
      const expected = JSON.parse(process.env.RECORDER_SMOKE_TRASH_EXPECTED!).evidence;
      await click('[data-open-trash]'); await until("document.querySelectorAll('[data-record-id]').length === 1 && !document.querySelector('[data-search-record]').disabled");
      await click('[data-record-id]'); await until("Boolean(document.querySelector('[data-trash-readonly]')) && !document.querySelector('[data-restore-record]').disabled");
      const persisted = await invoke('getRecord', { id: expected.before.id });
      if (!persisted.ok || JSON.stringify(persisted.value) !== JSON.stringify(expected.trashed) || await evaluate("Boolean(document.querySelector('[data-edit-record]'))")) throw new Error('Restart lost trash data or exposed an editor');
      if (process.env.RECORDER_SMOKE_SCREENSHOT) await writeFile(process.env.RECORDER_SMOKE_SCREENSHOT.replace('.png', '-trash-readonly.png'), (await contents.capturePage()).toPNG());
      await click('[data-restore-record]'); await until("document.querySelectorAll('[data-record-id]').length === 0 && !document.querySelector('[data-search-record]').disabled");
      const restored = await invoke('getRecord', { id: expected.before.id });
      if (!restored.ok || restored.value.deletedAt !== null || restored.value.id !== expected.before.id || restored.value.createdAt !== expected.before.createdAt || restored.value.body !== expected.trashed.body || restored.value.format !== expected.before.format || restored.value.revision !== 4) throw new Error('Restore changed identity/content or revision');
      checks.push('trash survives backend/Electron restart; readonly detail; UI restore retains ID/createdAt/body/format');
      await click('[data-open-active]'); await until("document.querySelectorAll('[data-record-id]').length === 3 && !document.querySelector('[data-search-record]').disabled");
      await click(`[data-record-id="${expected.before.id}"]`); await until("Boolean(document.querySelector('[data-trash-record]')) && !document.querySelector('[data-trash-record]').disabled");
      await click('[data-trash-record]'); await until("!document.querySelector('[data-search-record]').disabled && !document.querySelector('[data-trash-record]')");
      // Seed the remaining page through the same narrow bridge, then exercise pagination with actual UI mutations.
      const seeded = await evaluate(`(async () => { for (let i = 0; i < 31; i++) {
        const created = await window.recorder.invokeApi('createRecord', { requestId: crypto.randomUUID(), title: 'B003 bulk [' + i + ']', body: '分页回收样本', format: 'plain' });
        if (!created.ok) return false;
        const moved = await window.recorder.invokeApi('trashRecord', { id: created.value.id, expectedRevision: 1 }); if (!moved.ok) return false;
      } return true; })()`);
      if (!seeded) throw new Error('Pagination fixture could not traverse IPC');
      await click('[data-open-trash]'); await until("document.querySelectorAll('[data-record-id]').length === 30 && !document.querySelector('[data-record-next]').disabled");
      await click('[data-record-next]'); await until("document.querySelectorAll('[data-record-id]').length === 2 && !document.querySelector('[data-search-record]').disabled");
      for (let i = 0; i < 2; i++) {
        await click('[data-record-id]'); await until("Boolean(document.querySelector('[data-restore-record]')) && !document.querySelector('[data-restore-record]').disabled");
        await click('[data-restore-record]');
        await until(`document.querySelectorAll('[data-record-id]').length === ${i === 0 ? 1 : 30} && !document.querySelector('[data-search-record]').disabled`);
      }
      if (!await evaluate("document.querySelector('[data-record-prev]').disabled")) throw new Error('Empty final page did not return to valid first page');
      checks.push('restore refreshes pagination and backs out of an empty final page');
      const remaining = await invoke('listRecords', { state: 'trash' }), active = await invoke('listRecords', {});
      if (!remaining.ok || remaining.value.total !== 30 || !active.ok) throw new Error('Unexpected pre-empty records');
      await fill('recordQuery', remaining.value.items[0].title); await click('[data-search-record]');
      await until("document.querySelectorAll('[data-record-id]').length === 1 && !document.querySelector('[data-search-record]').disabled");
      let emptyCalls = 0, failEmpty = false;
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: any, init?: RequestInit) => {
          if (String(url).endsWith('/records/trash/empty')) { emptyCalls++; if (failEmpty) return new Response(JSON.stringify({ code: 'PLUGIN_UNAVAILABLE', message: '隔离清空失败样本' }), { status: 503 }); }
          return originalFetch(url, init);
        }) as typeof fetch;
        await click('[data-empty-trash]'); await until("Boolean(document.querySelector('[data-empty-confirmation]'))"); await click('[data-cancel-empty]');
        if (emptyCalls !== 0) throw new Error('Cancelled empty sent a request');
        failEmpty = true; await click('[data-empty-trash]'); await click('[data-confirm-empty]');
        await until("document.querySelector('[data-record-message]').textContent === '隔离清空失败样本' && !document.querySelector('[data-confirm-empty]').disabled");
        const unchanged = await invoke('listRecords', { state: 'trash' }); if (!unchanged.ok || unchanged.value.total !== 30) throw new Error('Failed empty lost records');
        failEmpty = false; await click('[data-confirm-empty]');
        await until("document.querySelector('[data-record-message]').textContent.includes('已永久删除 30 条') && !document.querySelector('[data-search-record]').disabled");
        if (Number(emptyCalls) !== 2) throw new Error('Empty request count incorrect');
      } finally { globalThis.fetch = originalFetch; }
      const afterActive = await invoke('listRecords', {}), afterTrash = await invoke('listRecords', { state: 'trash' });
      if (!afterActive.ok || !afterTrash.ok || afterTrash.value.total !== 0 || JSON.stringify(afterActive.value) !== JSON.stringify(active.value)) throw new Error('Empty affected active records or missed filtered-out trash');
      if (process.env.RECORDER_SMOKE_SCREENSHOT) await writeFile(process.env.RECORDER_SMOKE_SCREENSHOT.replace('.png', '-trash-empty.png'), (await contents.capturePage()).toPNG());
      checks.push('cancel empty sends no request; failure preserves records; confirmed UI empty deletes all trash despite filtered view, preserving active records');
    }
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
