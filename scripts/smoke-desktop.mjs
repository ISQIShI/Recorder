import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBackend } from '../backend/dist/bootstrap.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const desktop = fileURLToPath(new URL('../desktop/', import.meta.url));
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
const ctx = await createBackend({ http: { port: 0 } });
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
try {
  const env = { ...process.env, RECORDER_BACKEND_URL: ctx.recorderHttp.address,
    RECORDER_SMOKE_SCREENSHOT: fileURLToPath(new URL('../artifacts/desktop-smoke.png', import.meta.url)),
    RECORDER_SMOKE_RESULT: fileURLToPath(new URL('../artifacts/desktop-smoke.json', import.meta.url)) };
  await writeFile(env.RECORDER_SMOKE_RESULT, '{}');
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(requireDesktop('electron'), [desktop, '--smoke', '--enable-logging=stderr'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output = (output + data).slice(-24000); });
    child.stderr.on('data', data => { output = (output + data).slice(-24000); });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Electron smoke exceeded 35 seconds\n' + output)); }, 35000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', async code => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(await readFile(env.RECORDER_SMOKE_RESULT, 'utf8'));
        if (code !== 0 || result.passed !== true) reject(new Error('Electron smoke failed (exit ' + code + ')\n' + output));
        else { console.log('RECORDER_DESKTOP_SMOKE_OK', result); resolve(); }
      } catch (error) { reject(error); }
    });
  });
} finally { await ctx.fiber.dispose(); }
