import { createBackend } from './bootstrap.js';
const port = Number(process.env.RECORDER_PORT ?? 4317);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid RECORDER_PORT');
const ctx = await createBackend({ http: { port } });
console.log(JSON.stringify({ application: 'Recorder', address: ctx.recorderHttp.address, stage: 'foundation', storage: 'isolated in-memory probe' }));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await ctx.fiber.dispose();
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
