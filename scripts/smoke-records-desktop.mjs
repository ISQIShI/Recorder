import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createApplication } from '../backend/dist/application.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const desktop = join(root, 'desktop');
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
const artifacts = join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(join(artifacts, 'records-smoke-'));
const setupCode = 'isolated-desktop-smoke-setup-code';
await mkdir(join(directory, 'profile'));
let ctx;
try {
  let port = 0;
  for (const scenario of ['create', 'resume', 'discard-quit', 'discard-close', 'trash', 'trash-resume', 'tags', 'tags-resume', 'categories', 'categories-resume']) {
    const resume = scenario !== 'create';
    ctx = await createApplication({ dataDir: directory, setupCode, http: { port } });
    const address = ctx.recorderHttp.address;
    port = Number(new URL(address).port);
    const resultFile = join(directory, scenario + '.json');
    await writeFile(resultFile, '{}');
    const env = { ...process.env, RECORDER_BACKEND_URL: address, RECORDER_SMOKE_DATA_DIR: join(directory, 'profile'),
      RECORDER_SMOKE_SETUP_CODE: setupCode, RECORDER_SMOKE_RESUME: resume ? '1' : '0', RECORDER_SMOKE_RESULT: resultFile,
      RECORDER_SMOKE_SCENARIO: scenario,
      RECORDER_SMOKE_SCREENSHOT: join(artifacts, 'records-desktop.png') };
    if (scenario === 'trash-resume') env.RECORDER_SMOKE_TRASH_EXPECTED = await readFile(join(directory, 'trash.json'), 'utf8');
    if (scenario === 'tags-resume') env.RECORDER_SMOKE_TAGS_EXPECTED = await readFile(join(directory, 'tags.json'), 'utf8');
    if (scenario === 'categories-resume') env.RECORDER_SMOKE_CATEGORIES_EXPECTED = await readFile(join(directory, 'categories.json'), 'utf8');
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = spawn(requireDesktop('electron'), [desktop, '--business-smoke', '--enable-logging=stderr'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-16000); });
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Business desktop timeout\n' + output)); }, 45000);
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('exit', async code => {
        clearTimeout(timeout);
        try {
          const result = JSON.parse(await readFile(resultFile, 'utf8'));
          if (code !== 0 || result.passed !== true) throw new Error('Business desktop failed\n' + output);
          console.log('RECORDER_RECORDS_SMOKE_OK', result);
          resolve();
        } catch (error) { reject(error); }
      });
    });
    if (scenario === 'resume') {
      const row = ctx.recorderDatabase.raw.prepare('SELECT count(*) AS n FROM identity_sessions WHERE revoked_at IS NULL').get();
      if (row.n !== 0) throw new Error('Logout did not revoke the persisted session');
    }
    await ctx.fiber.dispose(); ctx = undefined;
  }
} finally { await ctx?.fiber.dispose(); }
