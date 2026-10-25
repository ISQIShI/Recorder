import type { Context } from '@deepseek-ai/cordis';
import type { FoundationStatus } from '@recorder/contracts';
import '../contracts.js';
export const inject = ['recorderStorage', 'recorderOperations'];
export function apply(ctx: Context) {
  ctx.recorderOperations.register(ctx, 'foundation/status', (): FoundationStatus => ({
    application: 'Recorder',
    stage: 'foundation',
    storage: { provider: ctx.recorderStorage.provider, value: ctx.recorderStorage.read() },
  }));
}
