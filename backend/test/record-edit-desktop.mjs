import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, request as forward } from 'node:http';
import { createApplication } from '../dist/application.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
await mkdir(join(root, 'artifacts'), { recursive: true });
const directory = await mkdtemp(join(root, 'artifacts/t01-update-'));
await mkdir(join(directory, 'profile'));
await writeFile(join(directory, 'renderer.html'), '<!doctype html><title>Isolated T01 API verification</title>');
const requireDesktop = createRequire(new URL('../../desktop/package.json', import.meta.url));
const setupCode = 'isolated-t01-update-smoke-code';
const config = { dataDir: directory, setupCode, http: { port: 0 } };
let ctx = await createApplication(config);
let proxy;
try {
  const requests = [];
  proxy = createServer((incoming, outgoing) => {
    const target = forward(new URL(incoming.url, ctx.recorderHttp.address), { method: incoming.method, headers: incoming.headers }, response => {
      outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);
    });
    let data = '';
    incoming.on('data', chunk => { data += chunk; });
    incoming.on('end', () => {
      if (incoming.method === 'PUT') requests.push({ method: incoming.method, path: incoming.url, body: JSON.parse(data),
        native: incoming.headers['x-recorder-client'] === 'native', bearer: incoming.headers.authorization?.startsWith('Bearer '), hasCookie: !!incoming.headers.cookie });
    });
    incoming.pipe(target);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, T01_BACKEND: 'http://127.0.0.1:' + proxy.address().port, T01_DIRECTORY: directory, T01_SETUP_CODE: setupCode };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(requireDesktop('electron'), [join(root, 'backend/test/record-edit-electron.mjs')], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-16000); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('T01 IPC timeout\n' + output)); }, 45000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('T01 Electron failed\n' + output)); });
  });
  const result = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'));
  assert.equal(result.passed, true);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.native, true); assert.equal(request.bearer, true); assert.equal(request.hasCookie, false);
    assert.deepEqual(Object.keys(request.body), ['expectedRevision', 'title', 'body', 'format']);
    assert.equal(request.body.expectedRevision, 1);
  }
  await ctx.fiber.dispose();
  ctx = await createApplication(config);
  const row = ctx.recorderDatabase.raw.prepare('SELECT * FROM records_entries WHERE id = ?').get(result.record.id);
  assert.equal(row.revision, 2);
  assert.equal(row.body, result.record.body);
  assert.equal(row.title, result.record.title);
  assert.equal(row.format, 'markdown');
  console.log('T01_REAL_ELECTRON_UPDATE_OK', { directory, persistedRevision: row.revision, putRequests: requests.length, conflictCode: result.conflictCode, rendererIsolation: true });
} finally { await new Promise(resolve => proxy?.close(resolve) ?? resolve()); await ctx.fiber.dispose(); }
