import { Context } from '@deepseek-ai/cordis';
import Database from 'better-sqlite3';
import * as ownership from '../../dist/plugins/database-ownership.js';
import * as database from '../../dist/plugins/database.js';
import { createApplication } from '../../dist/application.js';

const [filename, mode = 'hold', dataDir] = process.argv.slice(2);
let ctx, finishUse, databaseFiber, ownershipFiber, iterator, managed;
const events = [];
const originalClose = Database.prototype.close;
Database.prototype.close = function () {
  const result = originalClose.call(this);
  events.push(this.name.endsWith('.recorder-lock.sqlite') ? 'ownership-closed' : 'database-closed');
  return result;
};
const send = message => process.send?.(message);
try {
  if (mode === 'application') ctx = await createApplication({ filename, dataDir, setupCode: 'isolated-storage-host', http: { listen: false } });
  else {
    ctx = new Context();
    ownershipFiber = await ctx.plugin(ownership, { filename });
    databaseFiber = await ctx.plugin(database, { filename });
  }
  managed = ctx.recorderDatabase;
  if (mode === 'iterator') {
    ctx.logger.exporter({ export(message) {
      const error = message.args[0];
      if (error?.code === 'DATABASE_CLOSE_FAILED') send({ event: 'close-failed', code: error.code, open: managed.raw.open, cause: error.cause?.message });
    } });
    iterator = managed.raw.prepare('SELECT 1 AS value UNION ALL SELECT 2').iterate();
    iterator.next(); // A real unfinished SQLite statement, not a mocked close failure.
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
      else if (message === 'finish-iterator') {
        iterator.return();
        await managed.close();
        await managed.close(); // Successful retries are idempotent.
      }
      else if (message === 'close') {
        send({ event: 'closing' });
        if (mode === 'iterator') await Promise.all([databaseFiber.dispose(), ownershipFiber.dispose()]);
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
