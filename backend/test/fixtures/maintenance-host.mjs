import { readFileSync, writeFileSync } from 'node:fs';
import { createMaintenance } from '../../dist/maintenance-profile.js';
import { runMaintenanceCli } from '../../dist/maintenance-cli.js';
import { createApplication } from '../../dist/application.js';

const [configFile, command, ...args] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configFile, 'utf8'));
if (command === '__business') {
  let ctx;
  try { ctx = await createApplication({ filename: config.filename, dataDir: config.dataDir, http: { listen: false } }); console.log(JSON.stringify({ started: true })); }
  catch (error) { console.log(JSON.stringify({ code: error.code ?? 'ERROR' })); process.exitCode = 4; }
  finally { await ctx?.fiber.dispose(); }
} else if (command !== '__fault') {
  process.exitCode = await runMaintenanceCli([command, ...args], { sources: config.sources });
} else {
  const [checkpoint, signal] = args;
  const ctx = await createMaintenance(config), raw = ctx.recorderDatabase.raw;
  function pause(phase) {
    writeFileSync(signal, JSON.stringify({ phase }));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
  if (checkpoint === 'snapshot') {
    const backup = raw.backup.bind(raw);
    raw.backup = (filename, options) => backup(filename, { ...options, progress() { pause('snapshot'); return 1; } });
  } else if (checkpoint === 'before-commit' || checkpoint === 'after-commit') {
    const transaction = raw.transaction.bind(raw);
    raw.transaction = fn => {
      const wrapped = transaction(() => { const result = fn(); if (checkpoint === 'before-commit') pause(checkpoint); return result; });
      return { immediate(...params) {
        const result = wrapped.immediate(...params);
        if (checkpoint === 'after-commit') pause(checkpoint);
        return result;
      } };
    };
  } else if (checkpoint === 'final-validation') {
    const write = ctx.recorderMaintenanceRuns.write.bind(ctx.recorderMaintenanceRuns);
    ctx.recorderMaintenanceRuns.write = run => { write(run); if (run.phase === 'validating') pause(checkpoint); };
  } else throw new Error('Unknown fault checkpoint');
  const state = await ctx.recorderMaintenance.inspect();
  await ctx.recorderMaintenance.upgrade(state.plan.digest);
  throw new Error('Fault checkpoint was not reached');
}
