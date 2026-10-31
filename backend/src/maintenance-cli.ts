import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { createMaintenance, type MaintenanceOptions } from './maintenance-profile.js';
import { MaintenanceError } from './maintenance-contract.js';

const usage = 'Recorder offline maintenance: inspect | upgrade | resume | points | restore | verify\n' +
  '--database <source.sqlite> [--confirm <inspected-plan-digest> | --interactive] [--file-timeout-ms <1..86400000>]\n' +
  'restore: --point <sealed-id> --target <new-empty-directory>; verify: --target <isolated-directory>\n';
function parse(argv: string[]) {
  const [command, ...args] = argv;
  if (command === '--help' || command === 'help') return { command: 'help', flags: new Map<string, string>() };
  if (!command || !['inspect', 'upgrade', 'resume', 'points', 'restore', 'verify'].includes(command)) throw new Error('Unknown command');
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (!['--database', '--confirm', '--interactive', '--point', '--target', '--file-timeout-ms'].includes(flag) || flags.has(flag)) throw new Error('Unknown or duplicate option');
    if (flag === '--interactive') flags.set(flag, 'true');
    else { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Missing option value'); flags.set(flag, value); }
  }
  if (!flags.has('--database') || (flags.has('--interactive') && flags.has('--confirm')) ||
    ((command === 'restore' || command === 'verify') && !flags.has('--target')) || (command === 'restore' && !flags.has('--point')) ||
    (flags.has('--point') && command !== 'restore') || (flags.has('--target') && !['restore', 'verify'].includes(command)) ||
    (!['upgrade', 'resume'].includes(command) && (flags.has('--confirm') || flags.has('--interactive')))) throw new Error('Invalid command options');
  if (flags.has('--file-timeout-ms') && (!/^\d+$/.test(flags.get('--file-timeout-ms')!) || Number(flags.get('--file-timeout-ms')) < 1 || Number(flags.get('--file-timeout-ms')) > 86400000)) throw new Error('Invalid file timeout');
  return { command, flags };
}
function reportError(error: unknown) {
  const candidate = error as { code?: string; message?: string };
  const code = candidate.code ?? 'COMMAND_FAILED';
  console.error(JSON.stringify({ status: 'failed', code, message: candidate.code ? candidate.message : 'Maintenance command failed; preserve the source and incomplete materials for inspection' }));
  if (code === 'DATABASE_BUSY' || code === 'MAINTENANCE_BUSY') return 3;
  if (['CONFIRMATION_REQUIRED', 'STALE_PLAN'].includes(code)) return 2;
  if (['MAINTENANCE_INCOMPLETE', 'MANUAL_INTERVENTION', 'RUN_INVALID', 'ISOLATED_RECOVERY', 'UPGRADE_REQUIRED'].includes(code)) return 4;
  return 1;
}
/** Presentation/argument adapter only. Fixture overrides supply installed sources without a production arbitrary-SQL flag. */
export async function runMaintenanceCli(argv: string[], overrides: Pick<MaintenanceOptions, 'sources' | 'retainedSources'> = {}) {
  let parsed: ReturnType<typeof parse>;
  try { parsed = parse(argv); } catch { console.error(usage); return 64; }
  if (parsed.command === 'help') { stdout.write(usage); return 0; }
  let ctx: Awaited<ReturnType<typeof createMaintenance>> | undefined, resultCode = 0, progress: ReturnType<typeof setInterval> | undefined;
  try {
    const { command, flags } = parsed;
    ctx = await createMaintenance({ filename: flags.get('--database')!, ...(flags.has('--file-timeout-ms') ? { fileTimeoutMs: Number(flags.get('--file-timeout-ms')) } : {}), ...overrides });
    progress = setInterval(() => { const status = ctx?.recorderRecoveryPoints.status; if (status && status.phase !== 'idle') console.error(JSON.stringify({ recovery: status })); }, 1000); progress.unref();
    if (command === 'inspect') {
      const result = await ctx.recorderMaintenance.inspect(); console.log(JSON.stringify(result));
      if (result.state === 'manual' || result.plan.status === 'blocked') resultCode = 4;
    } else if (command === 'points') console.log(JSON.stringify(await ctx.recorderRecoveryPoints.list()));
    else if (command === 'restore') console.log(JSON.stringify(await ctx.recorderIsolatedRecovery.restore(flags.get('--point')!, flags.get('--target')!)));
    else if (command === 'verify') console.log(JSON.stringify(await ctx.recorderIsolatedRecovery.verify(flags.get('--target')!)));
    else {
      let confirmation = flags.get('--confirm') ?? '';
      if (flags.has('--interactive')) {
        const inspection = await ctx.recorderMaintenance.inspect(); console.log(JSON.stringify(inspection));
        const reader = createInterface({ input: stdin, output: stdout });
        try { confirmation = (await reader.question('Enter the displayed plan digest to confirm; anything else cancels: ')).trim(); }
        finally { reader.close(); }
        if (confirmation !== inspection.plan.digest) throw new MaintenanceError('CONFIRMATION_REQUIRED', 'Cancelled; no upgrade was started');
      }
      const result = command === 'upgrade' ? await ctx.recorderMaintenance.upgrade(confirmation) : await ctx.recorderMaintenance.resume(confirmation);
      console.log(JSON.stringify(result));
    }
  } catch (error) { resultCode = reportError(error); }
  finally {
    clearInterval(progress);
    if (ctx) {
      try {
        // No outstanding command work remains. Surface close errors before Cordis cleanup joins ownership.
        await ctx.recorderDatabase.close();
        await ctx.fiber.dispose();
      } catch (error) { resultCode = reportError(error); }
    }
  }
  return resultCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runMaintenanceCli(process.argv.slice(2));
