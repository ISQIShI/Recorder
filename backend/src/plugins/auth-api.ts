import type { Context } from '@deepseek-ai/cordis';
import '../domain.js';
export const inject = ['recorderApiOperations', 'recorderAuth'];
export function apply(ctx: Context) {
  const register = ctx.recorderApiOperations.register.bind(ctx.recorderApiOperations, ctx);
  register('info', () => ({ body: ctx.recorderAuth.info() }));
  for (const method of ['setup', 'login'] as const) register(method, async ({ input, channel }) => {
    const result = await ctx.recorderAuth[method](input, channel);
    return { body: result.identity, token: result.token, remember: input.remember };
  });
  register('me', ({ principal }) => ({ body: principal }));
  register('sessions', ({ principal }) => ({ body: { items: ctx.recorderAuth.sessions(principal!) } }));
  register('logout', ({ principal }) => {
    ctx.recorderAuth.revoke(principal!, principal!.sessionId);
    return { body: { ok: true }, clearSession: true };
  });
  register('revoke', ({ principal, input }) => {
    ctx.recorderAuth.revoke(principal!, input.sessionId);
    return { body: { ok: true }, clearSession: principal!.sessionId === input.sessionId };
  });
}
