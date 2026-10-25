import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import * as connection from '../../desktop/dist/plugins/connection.js';
const requireDesktop = createRequire(new URL('../../desktop/package.json', import.meta.url));
const { Context } = await import(pathToFileURL(requireDesktop.resolve('@deepseek-ai/cordis')).href);
const directory = process.env.T01_DIRECTORY;
app.setPath('userData', join(directory, 'profile'));
void app.whenReady().then(async () => {
const ctx = new Context();
const window = new BrowserWindow({ show: false, webPreferences: { preload: fileURLToPath(new URL('../../desktop/dist/preload.cjs', import.meta.url)), contextIsolation: true, sandbox: true, nodeIntegration: false } });
try {
  const rendererUrl = pathToFileURL(join(directory, 'renderer.html')).href;
  await ctx.plugin(owner => {
    owner.provide('recorderWindow', window);
    owner.provide('recorderCredentials', { load: async () => undefined, save: async () => {} });
  });
  await ctx.plugin(connection, { backendUrl: process.env.T01_BACKEND, rendererUrl });
  await window.loadURL(rendererUrl);
  const invoke = (method, input) => window.webContents.executeJavaScript(`window.recorder.invokeApi(${JSON.stringify(method)}, ${JSON.stringify(input)})`);
  const setup = await invoke('setup', { setupCode: process.env.T01_SETUP_CODE, username: 'owner', password: 'correct horse battery staple', remember: false, clientName: 'T01 IPC' });
  assert.equal(setup.ok, true, JSON.stringify(setup));
  assert.equal(Object.hasOwn(setup.value, 'token'), false);
  const created = await invoke('createRecord', { requestId: '12345678-1234-4123-8123-123456789abc', title: 'before', body: 'original', format: 'plain' });
  assert.equal(created.ok, true, JSON.stringify(created));
  const input = { id: created.value.id, expectedRevision: 1, title: 'IPC 修改', body: '# 原文\n😀 <script>source</script>', format: 'markdown' };
  const updated = await invoke('updateRecord', input);
  assert.equal(updated.ok, true, JSON.stringify(updated));
  assert.equal(updated.value.revision, 2);
  assert.equal(updated.value.body, input.body);
  const conflict = await invoke('updateRecord', input);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'REVISION_CONFLICT');
  assert.equal(conflict.error.status, 409);
  const get = await invoke('getRecord', { id: input.id });
  assert.deepEqual(get.value, updated.value);
  const isolation = await window.webContents.executeJavaScript(`({ require: typeof require, token: Object.keys(window.recorder).some(key => /token/i.test(key)) })`);
  assert.deepEqual(isolation, { require: 'undefined', token: false });
  await writeFile(join(directory, 'result.json'), JSON.stringify({ passed: true, record: updated.value, conflictCode: conflict.error.code }));
  await ctx.fiber.dispose(); window.destroy(); app.exit(0);
} catch (error) { console.error(error); await ctx.fiber.dispose(); window.destroy(); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
