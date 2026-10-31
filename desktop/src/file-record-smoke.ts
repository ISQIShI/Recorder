import type { Context } from '@deepseek-ai/cordis';
import { dialog } from 'electron';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import './contracts.js';
/** Dialog returns and explicit failure injection only; successful UI/IPC/HTTP/storage use real providers. */
export async function runFileRecordSmoke(ctx: Context) {
  const contents = ctx.recorderWindow.webContents, scenario = process.env.RECORDER_SMOKE_SCENARIO!, checks: string[] = [];
  const evaluate = (code: string) => contents.executeJavaScript(code, true);
  async function until(code: string) { const end = Date.now() + 30000; while (!await evaluate(code)) { if (Date.now() > end) throw new Error('File record UI timeout: ' + code + '\n' + await evaluate('document.body.innerText')); await new Promise(r => setTimeout(r, 50)); } }
  const click = (selector: string) => { console.log('FILE_RECORD_SMOKE_CLICK', selector); return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const fill = (name: string, value: string) => evaluate(`(() => { const e = document.querySelector('[name=${name}]'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const choose = (name: string, value: string) => evaluate(`(() => { const e = document.querySelector('[name=${name}]'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const invoke = (method: string, input: object) => evaluate(`window.recorder.invokeApi(${JSON.stringify(method)},${JSON.stringify(input)})`);
  const ready = () => until("!document.querySelector('[data-choose-file-record]').disabled && !document.querySelector('[data-search-record]').disabled");
  const editReady = () => until("Boolean(document.querySelector('[data-editor]')) && !document.querySelector('[data-editor] fieldset').disabled");
  const saved = () => until("document.querySelector('[data-editor-message]').textContent === '已保存到后端' && !document.querySelector('[data-editor] fieldset').disabled && !document.querySelector('[data-search-record]').disabled");
  await until("Boolean(document.querySelector('[name=username]')) || Boolean(document.querySelector('[data-signed-in]'))");
  if (!await evaluate("Boolean(document.querySelector('[data-signed-in]'))")) {
    if (await evaluate("Boolean(document.querySelector('[name=setupCode]'))")) await fill('setupCode', process.env.RECORDER_SMOKE_SETUP_CODE!);
    await fill('username', 'smoke-owner'); await fill('password', 'Recorder smoke password 2026!'); await click('[data-login-submit]');
  }
  await until("Boolean(document.querySelector('[data-signed-in]')) && Boolean(document.querySelector('[data-choose-file-record]'))"); await ready();
  const originalOpen = dialog.showOpenDialog, originalSave = dialog.showSaveDialog, source = process.env.RECORDER_SMOKE_SOURCE_FILE!, destination = process.env.RECORDER_SMOKE_SAVE_FILE! + '.file-record';
  let cancelChoose = false, selections = 0, evidence: any;
  dialog.showOpenDialog = (async () => { selections++; return { canceled: cancelChoose, filePaths: cancelChoose ? [] : [source] }; }) as typeof dialog.showOpenDialog;
  dialog.showSaveDialog = (async () => ({ canceled: false, filePath: destination })) as typeof dialog.showSaveDialog;
  try {
    if (scenario === 'file-records') {
      if (!await evaluate("document.querySelector('[data-save-record]').disabled")) throw new Error('Ordinary empty text creation became enabled');
      cancelChoose = true; const initial = (await invoke('listRecords', {})).value.total; await click('[data-choose-file-record]'); await ready(); cancelChoose = false;
      if (await evaluate("Boolean(document.querySelector('[data-file-record-chosen]'))") || (await invoke('listRecords', {})).value.total !== initial) throw new Error('Canceled chooser created a record');
      await fill('recordTitle', '文件建记录草稿守卫'); await fill('recordBody', '原正文'); await click('[data-save-record]'); await until("document.querySelector('[data-record-message]').textContent === '已保存到后端' && !document.querySelector('[data-search-record]').disabled");
      const before = (await invoke('listRecords', {})).value.total;
      await click('[data-edit-record]'); await editReady(); await fill('editBody', '不能丢失的草稿'); await evaluate('window.confirm = () => false; void 0');
      const selected = selections; await click('[data-choose-file-record]'); if (selections !== selected || !await evaluate("document.querySelector('[name=editBody]').value === '不能丢失的草稿'")) throw new Error('File creation bypassed draft guard');
      await evaluate('window.confirm = () => true; void 0'); await click('[data-choose-file-record]'); await ready();
      if (await evaluate("Boolean(document.querySelector('[data-editor]'))") || !await evaluate("Boolean(document.querySelector('[data-file-record-chosen]'))")) throw new Error('File chooser did not end confirmed edit');
      const originalFetch = globalThis.fetch; const uploadPaths: string[] = [];
      try {
        globalThis.fetch = (async (url: any, init?: RequestInit) => {
          if (init?.method === 'PUT' && String(url).includes('/file-records/')) { uploadPaths.push(String(url)); return new Promise((_done, reject) => { init.signal!.addEventListener('abort', () => reject(new Error('isolated cancellation')), { once: true }); }); }
          return originalFetch(url, init);
        }) as typeof fetch;
        await click('[data-create-file-record]'); await until("Boolean(document.querySelector('[data-cancel-file-record]'))"); await click('[data-cancel-file-record]'); await ready();
        if ((await invoke('listRecords', {})).value.total !== before || !await evaluate("Boolean(document.querySelector('[data-file-record-chosen]'))")) throw new Error('Canceled upload left a shell or lost retry');
        globalThis.fetch = (async (url: any, init?: RequestInit) => {
          if (init?.method === 'PUT' && String(url).includes('/file-records/')) { uploadPaths.push(String(url)); const response = await originalFetch(url, init); if (!response.ok) return response; await response.text(); throw new Error('isolated lost successful response'); }
          return originalFetch(url, init);
        }) as typeof fetch;
        await click('[data-create-file-record]'); await ready();
        if ((await invoke('listRecords', {})).value.total !== before + 1 || !await evaluate("Boolean(document.querySelector('[data-file-record-chosen]')) && !document.querySelector('[data-file-record-message]').textContent.includes('首个附件已保存')")) throw new Error('Uncertain committed result lost retry or was reported successful');
        globalThis.fetch = (async (url: any, init?: RequestInit) => { if (init?.method === 'PUT' && String(url).includes('/file-records/')) uploadPaths.push(String(url)); return originalFetch(url, init); }) as typeof fetch;
        await click('[data-create-file-record]'); await until("document.querySelector('[data-file-record-message]').textContent.includes('首个附件已保存') && !document.querySelector('[data-search-record]').disabled && Boolean(document.querySelector('[data-record-attachments]'))");
        if (new Set(uploadPaths).size !== 1 || uploadPaths.length !== 3 || (await invoke('listRecords', {})).value.total !== before + 1) throw new Error('Lost response retry duplicated record or changed request');
      } finally { globalThis.fetch = originalFetch; }
      const found = await invoke('listRecords', { q: basename(source) }); if (!found.ok || found.value.total !== 1) throw new Error('File record missing from title search');
      const record = found.value.items[0], attachment = (await invoke('listAttachments', { id: record.id })).value.items[0];
      if (record.body !== '' || record.format !== 'plain' || record.title !== basename(source) || !await evaluate(`Boolean(document.querySelector('[data-record-id="${record.id}"]')) && document.querySelector('[data-record-attachments]').getAttribute('data-record-attachments') === '${record.id}'`)) throw new Error('File record not selected/listed as plain empty record');
      const sourceDigest = createHash('sha256').update(await readFile(source)).digest('hex'); if (attachment.digest !== sourceDigest) throw new Error('File record upload digest mismatch');
      if (process.env.RECORDER_SMOKE_SCREENSHOT) { await evaluate("document.querySelector('[data-panel=file-records]').scrollIntoView(); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"); await writeFile(process.env.RECORDER_SMOKE_SCREENSHOT.replace('.png', '-file-record-created.png'), (await contents.capturePage()).toPNG()); }
      evidence = { record, attachment, sourceDigest }; checks.push('chooser/draft cancellation sends no creation; canceled upload no shell; lost successful response retains selection and same request retry creates once; actual streaming upload, title search and automatic detail selection');
    } else {
      const expected = JSON.parse(process.env.RECORDER_SMOKE_FILE_RECORD_EXPECTED!).evidence, id = expected.record.id;
      await fill('recordQuery', expected.record.title); await click('[data-search-record]'); await until("!document.querySelector('[data-search-record]').disabled && document.querySelectorAll('[data-record-id]').length === 1"); await click('[data-record-id]');
      await until("Boolean(document.querySelector('[data-record-attachments]')) && document.querySelectorAll('[data-attachment]').length === 1 && !document.querySelector('[data-refresh-attachments]').disabled");
      const persisted = await invoke('getRecord', { id }); if (JSON.stringify(persisted.value) !== JSON.stringify(expected.record)) throw new Error('Restart lost empty record metadata');
      await click('[data-save-attachment]'); await until("document.querySelector('[data-attachments-message]').textContent.includes('已另存为') && !document.querySelector('[data-refresh-attachments]').disabled"); const savedDigest = createHash('sha256').update(await readFile(destination)).digest('hex'); if (savedDigest !== expected.sourceDigest) throw new Error('File-record save differs');
      await click('[data-edit-record]'); await editReady(); await fill('editTitle', '仅编辑文件记录标题'); await click('[data-save-edit]'); await saved();
      let current = (await invoke('getRecord', { id })).value; if (current.body !== '' || current.revision !== 2) throw new Error('Blank-body manual edit failed');
      await fill('editTitle', '空正文冲突草稿'); await invoke('updateRecord', { id, expectedRevision: current.revision, title: '后端竞争修改', body: '', format: 'plain' }); await click('[data-save-edit]');
      await until("document.querySelector('[data-editor-message]').textContent.includes('版本冲突') && !document.querySelector('[data-editor] fieldset').disabled");
      await click('[data-latest-record]'); await until("Boolean(document.querySelector('[data-latest]')) && !document.querySelector('[data-editor] fieldset').disabled");
      if (!await evaluate("document.querySelector('[name=editTitle]').value === '空正文冲突草稿' && document.querySelector('[name=editBody]').value === '' && document.querySelector('[data-editor-dirty]').textContent.includes('基线版本 2')")) throw new Error('Empty-body conflict replaced draft or baseline');
      await click('[data-rebase-edit]'); await click('[data-save-edit]'); await saved(); await fill('editBody', '后来添加的正文'); await click('[data-save-edit]'); await saved(); await fill('editBody', ''); await fill('editTitle', ''); await click('[data-save-edit]'); await saved();
      await click('[data-cancel-edit]'); await fill('recordQuery', ''); await click('[data-search-record]'); await ready();
      if (!await evaluate(`document.querySelector('[data-record-id="${id}"] strong').textContent === '无标题记录'`)) throw new Error('Empty title has no list fallback'); await click(`[data-record-id="${id}"]`);
      await until("Boolean(document.querySelector('[data-record-tags] fieldset')) && !document.querySelector('[data-record-tags] fieldset').disabled"); await fill('tagName', '文件记录标签'); await click('[data-create-tag]'); await until("document.querySelectorAll('[data-tag-id]').length === 1 && !document.querySelector('[data-refresh-tags]').disabled");
      await fill('categoryName', '文件记录分类'); await click('[data-create-category]'); await until("document.querySelector('[name=recordCategory]').options.length > 1 && !document.querySelector('[data-refresh-categories]').disabled");
      const categories = await invoke('listCategories', {}), category = categories.value.items.find((x: any) => x.name === '文件记录分类'); await choose('recordCategory', category.id); await click('[data-add-category]'); await until("document.querySelectorAll('[data-record-category]').length === 1 && !document.querySelector('[data-refresh-categories]').disabled");
      // Use a blank title query so the fallback-name record remains selectable after returning from trash.
      await fill('recordQuery', ''); await click('[data-search-record]'); await ready(); await click(`[data-record-id="${id}"]`); await until("Boolean(document.querySelector('[data-trash-record]')) && !document.querySelector('[data-search-record]').disabled");
      await click('[data-trash-record]'); await until("document.querySelector('[data-record-message]').textContent.includes('已移入回收站') && !document.querySelector('[data-search-record]').disabled"); await click('[data-open-trash]'); await ready(); await click(`[data-record-id="${id}"]`);
      await until("Boolean(document.querySelector('[data-restore-record]')) && document.querySelectorAll('[data-attachment]').length === 1 && !document.querySelector('[data-refresh-attachments]').disabled"); if (await evaluate("Boolean(document.querySelector('[data-delete-attachment]'))")) throw new Error('Trashed file record writable');
      await click('[data-restore-record]'); await ready(); await click('[data-open-active]'); await ready(); await click(`[data-record-id="${id}"]`);
      await until("document.querySelectorAll('[data-attachment]').length === 1 && document.querySelectorAll('[data-tag-id]').length === 1 && document.querySelectorAll('[data-record-category]').length === 1 && !document.querySelector('[data-refresh-attachments]').disabled");
      await click('[data-delete-attachment]'); await click('[data-confirm-attachment-delete]'); await until("document.querySelectorAll('[data-attachment]').length === 0 && !document.querySelector('[data-refresh-attachments]').disabled");
      current = await invoke('getRecord', { id }); if (!current.ok || current.value.title !== '' || current.value.body !== '') throw new Error('Last attachment deletion removed empty record');
      if (process.env.RECORDER_SMOKE_SCREENSHOT) { await evaluate("document.querySelector('[data-record-attachments]').scrollIntoView(); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"); await writeFile(process.env.RECORDER_SMOKE_SCREENSHOT.replace('.png', '-file-records.png'), (await contents.capturePage()).toPNG()); }
      evidence = { record: current.value, sourceDigest: expected.sourceDigest, savedDigest }; checks.push('restart reads empty record; real save digest; blank-body title edit and 409 keeps draft/baseline; explicit rebase, add/remove body; title fallback; UI tag/category, trash/restore retain links; last attachment removal retains empty record');
    }
    await writeFile(process.env.RECORDER_SMOKE_RESULT!, JSON.stringify({ passed: true, scenario, checks, evidence }));
  } finally { dialog.showOpenDialog = originalOpen; dialog.showSaveDialog = originalSave; }
}
