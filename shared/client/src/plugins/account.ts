import type { Context } from '@deepseek-ai/cordis';
import { reactive } from 'vue';
import { ApiError, type Identity, type Credentials, type ApiOutputs } from '@recorder/contracts';
import '../api-transport.js';
import './leave-guard.js';
export interface Account {
  state: { ready: boolean; info?: ApiOutputs['info']; identity?: Identity; error: string };
  refresh(): Promise<void>; login(input: Credentials, setupCode?: string): Promise<void>; logout(): Promise<boolean>; error(error: unknown): string;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderAccount: Account } }
export const inject = ['recorderApi', 'recorderLeave'];
export function apply(ctx: Context) {
  const state: Account['state'] = reactive({ ready: false, error: '' });
  let active = true, generation = 0;
  ctx.effect(() => () => { active = false; generation++; state.identity = undefined; });
  const account: Account = {
    state,
    error(error) {
      if (error instanceof ApiError && error.status === 401) { generation++; state.identity = undefined; }
      return error instanceof Error ? error.message : '请求失败';
    },
    async refresh() {
      const version = ++generation;
      try {
        const info = await ctx.recorderApi.request('info', {});
        if (!active || version !== generation) return;
        state.info = info;
        if (info.initialized) {
          try {
            const identity = await ctx.recorderApi.request('me', {});
            if (active && version === generation) state.identity = identity;
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 401)) throw error;
            if (active && version === generation) state.identity = undefined;
          }
        }
        state.error = '';
      } catch (error) { if (active && version === generation) state.error = account.error(error); }
      finally { if (active && version === generation) state.ready = true; }
    },
    async login(input, setupCode) {
      const version = ++generation;
      const identity = setupCode === undefined ? await ctx.recorderApi.request('login', input) : await ctx.recorderApi.request('setup', { ...input, setupCode });
      if (!active || version !== generation) return;
      state.identity = identity;
      state.info = { ...state.info!, initialized: true };
    },
    async logout() {
      if (!ctx.recorderLeave.confirm()) return false;
      const version = ++generation, session = state.identity?.sessionId;
      await ctx.recorderApi.request('logout', {});
      if (active && version === generation && state.identity?.sessionId === session) state.identity = undefined;
      return true;
    },
  };
  ctx.provide('recorderAccount', account);
  void account.refresh();
}
