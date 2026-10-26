import { createApplication } from './application.js';
import { MigrationError } from './domain.js';
async function start() {
  const port = Number(process.env.RECORDER_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid RECORDER_PORT');
  const ctx = await createApplication({ http: { port } });
  console.log(JSON.stringify({ application: 'Recorder', address: ctx.recorderHttp.address, stage: 'records', initialized: ctx.recorderAuth.info().initialized }));
  if (!ctx.recorderAuth.info().initialized) console.log('首次账号设置需要数据目录中的 setup-code.txt；默认目录为仓库根目录 .recorder。');
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await ctx.fiber.dispose();
  }
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
}
try { await start(); }
catch (error) {
  console.error(JSON.stringify({ application: 'Recorder', status: error instanceof MigrationError ? 'maintenance-required' : 'startup-failed',
    code: error instanceof MigrationError ? error.code : 'STARTUP_FAILED',
    message: error instanceof MigrationError ? error.message : 'Backend startup failed' }));
  process.exitCode = 1;
}
