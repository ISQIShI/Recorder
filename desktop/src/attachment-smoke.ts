import type { Context } from '@deepseek-ai/cordis';
import { dialog } from 'electron';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './contracts.js';
async function hash(path: string) { const digest = createHash('sha256'); for await (const bytes of createReadStream(path)) digest.update(bytes); return digest.digest('hex'); }
/** Only dialog choices/failure responses are substituted; actual renderer/IPC/device streams/HTTP/SQLite run. */
export async function runAttachmentSmoke(ctx: Context) {
  const contents = ctx.recorderWindow.webContents, scenario = process.env.RECORDER_SMOKE_SCENARIO!, checks: string[] = [];
  const evaluate = (code: string) => contents.executeJavaScript(code, true);
  async function until(code: string) { const deadline = Date.now() + (process.env.RECORDER_SMOKE_LARGE_FILE ? 600000 : 30000); while (!await evaluate(code)) { if (Date.now() > deadline) throw new Error('Attachment UI timeout: ' + code + '\n' + await evaluate('document.body.innerText')); await new Promise(r => setTimeout(r, 60)); } }
  const click = (selector: string) => { console.log('ATTACHMENT_SMOKE_CLICK', selector); return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const fill = (name: string, value: string) => evaluate(`(() => { const e = document.querySelector('[name=${name}]'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const invoke = (method: string, input: object) => evaluate(`window.recorder.invokeApi(${JSON.stringify(method)},${JSON.stringify(input)})`);
  const ready = () => until("Boolean(document.querySelector('[data-record-attachments]')) && !document.querySelector('[data-refresh-attachments]').disabled && !document.querySelector('[data-search-record]').disabled");
  await until("Boolean(document.querySelector('[name=username]')) || Boolean(document.querySelector('[data-signed-in]'))");
  if (!await evaluate("Boolean(document.querySelector('[data-signed-in]'))")) { if (await evaluate("Boolean(document.querySelector('[name=setupCode]'))")) await fill('setupCode', process.env.RECORDER_SMOKE_SETUP_CODE!); await fill('username', 'smoke-owner'); await fill('password', 'Recorder smoke password 2026!'); await click('[data-login-submit]'); }
  await until("Boolean(document.querySelector('[data-signed-in]')) && !document.querySelector('[data-search-record]').disabled");
  const openDialog = dialog.showOpenDialog, saveDialog = dialog.showSaveDialog; let selectedPath = process.env.RECORDER_SMOKE_SOURCE_FILE!, destination = process.env.RECORDER_SMOKE_SAVE_FILE!, selections = 0, cancelSelection = false;
  dialog.showOpenDialog = (async () => { selections++; return { canceled: cancelSelection, filePaths: cancelSelection ? [] : [selectedPath] }; }) as typeof dialog.showOpenDialog;
  dialog.showSaveDialog = (async () => ({ canceled: false, filePath: destination })) as typeof dialog.showSaveDialog;
  let evidence: unknown;
  try {
    if (scenario === 'attachments') {
      await fill('recordTitle', '托管附件验收目标'); await fill('recordBody', '正文与附件分别管理'); await click('[data-save-record]');
      await until("document.querySelector('[data-record-message]').textContent === '已保存到后端' && !document.querySelector('[data-search-record]').disabled"); await ready();
      const before = await invoke('listRecords', { q: '托管附件验收目标' }); if (!before.ok || before.value.total !== 1) throw new Error('Attachment record fixture missing'); const record = before.value.items[0];
      cancelSelection = true; await click('[data-choose-attachment]'); await ready(); if (await evaluate("Boolean(document.querySelector('[data-chosen-attachment]'))")) throw new Error('Canceled chooser retained a file'); cancelSelection = false;
      await click('[data-edit-record]'); await until("Boolean(document.querySelector('[data-editor]')) && !document.querySelector('[data-editor] fieldset').disabled"); await fill('editBody', '附件操作保护的正文草稿'); await evaluate('window.confirm = () => false; void 0');
      const oldSelections = selections; await click('[data-choose-attachment]'); if (selections !== oldSelections || !await evaluate("document.querySelector('[name=editBody]').value === '附件操作保护的正文草稿'")) throw new Error('Choosing attachment bypassed draft guard');
      await evaluate('window.confirm = () => true; void 0'); await click('[data-choose-attachment]'); await ready();
      if (!await evaluate("Boolean(document.querySelector('[data-chosen-attachment]')) && !document.querySelector('[data-editor]')")) throw new Error('Chooser/guard did not expose file metadata');
      const forbidden = await evaluate("window.recorder.files.invoke('upload', { path: 'C:/not-granted', recordId: 'invalid' })"); if (forbidden.ok || forbidden.error.status !== 400) throw new Error('Device bridge accepted arbitrary path');
      // Hold the native request before HTTP to deterministically select cancellation; actual HTTP abort is tested separately.
      const original = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: any, init?: RequestInit) => { if (init?.method === 'PUT' && String(url).includes('/attachments/')) return new Promise<Response>((_resolve, reject) => { init.signal!.addEventListener('abort', () => reject(new Error('isolated cancel')), { once: true }); }); return original(url, init); }) as typeof fetch;
        await click('[data-upload-attachment]'); await until("Boolean(document.querySelector('[data-cancel-file]'))"); await click('[data-cancel-file]'); await ready();
        if (await evaluate("document.querySelectorAll('[data-attachment]').length") !== 0 || !await evaluate("Boolean(document.querySelector('[data-chosen-attachment]'))")) throw new Error('Canceled transfer was reported saved or lost retry selection');
      } finally { globalThis.fetch = original; }
      await evaluate('window.__fileProgress = []; window.__stopFileProgress = window.recorder.files.onProgress(p => window.__fileProgress.push(p)); void 0');
      await click('[data-upload-attachment]'); await until("document.querySelector('[data-attachments-message]').textContent.includes('附件已保存到后端') && !document.querySelector('[data-refresh-attachments]').disabled");
      const list = await invoke('listAttachments', { id: record.id }); if (!list.ok || list.value.items.length !== 1) throw new Error('Attachment not committed exactly once'); const attachment = list.value.items[0], sourceDigest = await hash(selectedPath);
      if (attachment.digest !== sourceDigest || (process.env.RECORDER_SMOKE_LARGE_FILE && attachment.bytes !== 1073741824)) throw new Error('Actual upload size/digest mismatch');
      if (!await evaluate("window.__fileProgress.some(p => p.phase === 'upload' && p.bytes === p.total && p.total > 0)")) throw new Error('Native streaming upload progress missing');
      const after = await invoke('getRecord', { id: record.id }); if (JSON.stringify(after.value) !== JSON.stringify(record)) throw new Error('Attachment upload changed record revision');
      if (process.env.RECORDER_SMOKE_SCREENSHOT) { await evaluate("document.querySelector('[data-panel=attachments]').scrollIntoView(); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"); await writeFile(process.env.RECORDER_SMOKE_SCREENSHOT.replace('.png', '-attachments.png'), (await contents.capturePage()).toPNG()); }
      evidence = { record, attachment, sourceDigest }; checks.push('real chooser/IPC upload; canceled chooser and dirty guard send no upload; canceled transfer remains retryable; actual streamed size/digest and progress; record metadata unchanged');
    } else {
      const expected = JSON.parse(process.env.RECORDER_SMOKE_ATTACHMENTS_EXPECTED!).evidence, id = expected.record.id, attachment = expected.attachment;
      await fill('recordQuery', '托管附件验收目标'); await click('[data-search-record]'); await until("document.querySelectorAll('[data-record-id]').length === 1 && !document.querySelector('[data-search-record]').disabled"); await click('[data-record-id]'); await ready(); await until("document.querySelectorAll('[data-attachment]').length === 1");
      const list = await invoke('listAttachments', { id }); if (!list.ok || JSON.stringify(list.value.items[0]) !== JSON.stringify(attachment)) throw new Error('Restart lost attachment metadata');
      await writeFile(destination, 'old destination stays on failure'); const original = globalThis.fetch;
      try { globalThis.fetch = (async (url: any, init?: RequestInit) => init?.method === 'GET' && String(url).includes('/attachments/') ? new Response('partial', { headers: { 'content-length': String(attachment.bytes), 'x-recorder-digest': attachment.digest } }) : original(url, init)) as typeof fetch;
        await click('[data-save-attachment]'); await ready(); if ((await readFile(destination, 'utf8')) !== 'old destination stays on failure' || await evaluate("document.querySelector('[data-attachments-message]').textContent.includes('已另存为')")) throw new Error('Failed save replaced destination or reported success');
      } finally { globalThis.fetch = original; }
      await click('[data-save-attachment]'); await until("document.querySelector('[data-attachments-message]').textContent.includes('已另存为') && !document.querySelector('[data-refresh-attachments]').disabled"); const savedDigest = await hash(destination); if (savedDigest !== expected.sourceDigest) throw new Error('Actual saved file differs from chosen source');
      let deletions = 0; try { globalThis.fetch = (async (url: any, init?: RequestInit) => { if (String(url).includes('/attachments/') && String(url).endsWith('/delete')) deletions++; return original(url, init); }) as typeof fetch;
        await click('[data-delete-attachment]'); await click('[data-cancel-attachment-delete]'); if (deletions !== 0) throw new Error('Canceled delete sent a request');
        await click('[data-delete-attachment]'); await click('[data-confirm-attachment-delete]'); await until("document.querySelectorAll('[data-attachment]').length === 0 && !document.querySelector('[data-refresh-attachments]').disabled"); if (Number(deletions) !== 1) throw new Error('Delete count mismatch');
      } finally { globalThis.fetch = original; }
      const retained = await invoke('getRecord', { id }); if (!retained.ok || retained.value.revision !== 1) throw new Error('Deleting last attachment removed/changed record');
      selectedPath = process.env.RECORDER_SMOKE_SMALL_FILE!; await click('[data-choose-attachment]'); await ready(); await click('[data-upload-attachment]'); await until("document.querySelectorAll('[data-attachment]').length === 1 && !document.querySelector('[data-refresh-attachments]').disabled");
      await click('[data-trash-record]'); await until("document.querySelector('[data-record-message]').textContent.includes('已移入回收站') && !document.querySelector('[data-search-record]').disabled"); await click('[data-open-trash]'); await until("!document.querySelector('[data-search-record]').disabled && document.querySelectorAll('[data-record-id]').length === 1"); await click('[data-record-id]'); await ready(); await until("document.querySelectorAll('[data-attachment]').length === 1");
      if (await evaluate("Boolean(document.querySelector('[data-choose-attachment]')) || Boolean(document.querySelector('[data-delete-attachment]'))")) throw new Error('Trash attachment UI is writable'); destination += '.trash'; await click('[data-save-attachment]'); await until("document.querySelector('[data-attachments-message]').textContent.includes('已另存为') && !document.querySelector('[data-refresh-attachments]').disabled"); if (await hash(destination) !== await hash(selectedPath)) throw new Error('Trash attachment could not be saved');
      await click('[data-restore-record]'); await until("!document.querySelector('[data-restore-record]') && !document.querySelector('[data-search-record]').disabled"); await click('[data-open-active]'); await until("!document.querySelector('[data-search-record]').disabled"); await fill('recordQuery', '托管附件验收目标'); await click('[data-search-record]'); await until("document.querySelectorAll('[data-record-id]').length === 1 && !document.querySelector('[data-search-record]').disabled"); await click('[data-record-id]'); await ready(); await until("document.querySelectorAll('[data-attachment]').length === 1");
      await click('[data-trash-record]'); await until("!document.querySelector('[data-search-record]').disabled && document.querySelector('[data-record-message]').textContent.includes('已移入回收站')"); await click('[data-open-trash]'); await until("!document.querySelector('[data-search-record]').disabled"); await click('[data-empty-trash]'); await click('[data-confirm-empty]'); await until("document.querySelector('[data-record-message]').textContent.includes('已永久删除 1 条') && !document.querySelector('[data-search-record]').disabled");
      if (await hash(process.env.RECORDER_SMOKE_SOURCE_FILE!) !== expected.sourceDigest) throw new Error('Original file changed'); evidence = { bytes: attachment.bytes, sourceDigest: expected.sourceDigest, savedDigest };
      checks.push('backend/Electron restart; real streamed save SHA-256 equals source, failed download preserves target; delete cancel/confirmation retains record; trash read-only save, restore and empty retain correct semantics; original source preserved');
    }
    if (!await evaluate("typeof window.require === 'undefined' && typeof window.recorder.files.invoke === 'function'")) throw new Error('File renderer isolation failed');
    await writeFile(process.env.RECORDER_SMOKE_RESULT!, JSON.stringify({ passed: true, scenario, checks, evidence }));
  } finally { dialog.showOpenDialog = openDialog; dialog.showSaveDialog = saveDialog; }
}
