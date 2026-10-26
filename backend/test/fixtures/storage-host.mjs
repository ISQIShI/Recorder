import { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import * as ownership from '../../dist/plugins/database-ownership.js';
import * as database from '../../dist/plugins/database.js';
import { createApplication } from '../../dist/application.js';

const [filename, mode = 'hold', dataDir] = process.argv.slice(2);
let ctx, finishUse;
const events = [];
const originalClose = Database.prototype.close;
Database.prototype.close = function () {
  events.push(this.name.endsWith('.recorder-lock.sqlite') ? 'ownership-closed' : 'database-closed');
  return originalClose.call(this);
};
const send = message => process.send?.(message);
try {
  if (mode === 'application') ctx = await createApplication({ filename, dataDir, setupCode: 'isolated-storage-host', http: { listen: false } });
  else {
    ctx = new Context();
    await ctx.plugin(ownership, { filename });
    await ctx.plugin(database, { filename });
  }
  send({ event: 'ready', filename: ctx.recorderDatabase.raw.name, controlFile: ctx.recorderDatabaseOwnership.controlFile });
  process.on('message', async message => {
    try {
      if (message === 'use') {
        void ctx.recorderDatabase.use(async raw => {
          send({ event: 'using' });
          await new Promise(resolve => { finishUse = resolve; });
          if (!raw.open) throw new Error('Database closed while still in use');
          raw.prepare('SELECT 1').get(); events.push('use-finished');
        }).catch(error => send({ event: 'error', code: error.code ?? 'ERROR' }));
      } else if (message === 'finish') finishUse?.();
      else if (message === 'close') {
        send({ event: 'closing' });
        await ctx.fiber.dispose();
        send({ event: 'closed', events });
        process.disconnect();
      }
    } catch (error) { send({ event: 'error', code: error.code ?? 'ERROR' }); process.exitCode = 1; }
  });
} catch (error) {
  await ctx?.fiber.dispose();
  send({ event: 'rejected', code: error.code ?? 'ERROR' });
  process.exitCode = 2;
  process.disconnect();
}
