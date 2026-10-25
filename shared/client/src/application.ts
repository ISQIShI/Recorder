import { Context } from '@deepseek-ai/cordis';
import type { ApiTransport } from '@recorder/contracts';
import { PanelRegistry } from './services.js';
import { webApi, nativeApi } from './api-transport.js';
import * as shell from './plugins/shell.js';
import * as account from './plugins/account.js';
import * as accountPanel from './plugins/account-panel.js';
import * as recordsPanel from './plugins/records-panel.js';
export async function mountApplication(target: Element, platform: string, bridge?: ApiTransport) {
  const ctx = new Context();
  try {
    await ctx.plugin((owner: Context) => { owner.provide('recorderPlatform', { name: platform }); });
    await ctx.plugin(PanelRegistry);
    if (bridge) await ctx.plugin(nativeApi, { bridge }); else await ctx.plugin(webApi);
    await ctx.plugin(account);
    await ctx.plugin(shell, { target, application: true });
    await ctx.plugin(accountPanel);
    await ctx.plugin(recordsPanel);
    return ctx;
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}
