import { Context, type Plugin } from '@deepseek-ai/cordis';
import type { StatusTransport } from '@recorder/contracts';
import { PanelRegistry } from './services.js';
import * as shell from './plugins/shell.js';
import * as statusPanel from './plugins/status-panel.js';
import * as lifecycleDemo from './plugins/lifecycle-demo.js';
import { fetchTransport, bridgeTransport } from './transport.js';
export { PanelRegistry, fetchTransport, bridgeTransport };
export { statusPanel };
// A profile only selects modules and configuration. Cordis owns every lifecycle.
export interface ClientEntry { plugin: Plugin<any>; config?: unknown }
export function clientProfile(target: Element, platform: string, bridge?: StatusTransport): ClientEntry[] {
  return [
    { plugin: (owner: Context) => { owner.provide('recorderPlatform', { name: platform }); } },
    { plugin: PanelRegistry },
    bridge ? { plugin: bridgeTransport, config: { bridge } } : { plugin: fetchTransport },
    { plugin: shell, config: { target } },
    { plugin: statusPanel },
    { plugin: lifecycleDemo },
  ];
}
export async function mountClient(target: Element, platform: string, bridge?: StatusTransport, entries = clientProfile(target, platform, bridge)) {
  const ctx = new Context();
  try {
    for (const entry of entries) await ctx.plugin(entry.plugin, entry.config);
    return ctx;
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}
