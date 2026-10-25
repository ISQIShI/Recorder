import { Context, type Context as PluginContext } from '@deepseek-ai/cordis';
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '@recorder/contracts';

declare module '@deepseek-ai/cordis' { interface Context { recorderPreloadBridge: DesktopBridge } }
function ipcBridge(ctx: PluginContext) {
  ctx.provide('recorderPreloadBridge', {
    status: () => ipcRenderer.invoke('recorder:foundation-status'),
    invokeApi: (method, input) => ipcRenderer.invoke('recorder:api', method, input),
  } satisfies DesktopBridge);
}
const ctx = new Context();
void ctx.plugin(ipcBridge);
// One fixed, narrow platform ABI delegates to the active plugin provider.
contextBridge.exposeInMainWorld('recorder', {
  status: () => ctx.get('recorderPreloadBridge')?.status() ?? Promise.reject(new Error('Bridge unavailable')),
  invokeApi: (method: Parameters<DesktopBridge['invokeApi']>[0], input: unknown) => ctx.get('recorderPreloadBridge')?.invokeApi(method, input) ?? Promise.reject(new Error('Bridge unavailable')),
});
