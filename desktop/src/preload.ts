import { Context, type Context as PluginContext } from '@deepseek-ai/cordis';
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '@recorder/contracts';

declare module '@deepseek-ai/cordis' { interface Context { recorderPreloadBridge: DesktopBridge } }
function ipcBridge(ctx: PluginContext) {
  ctx.provide('recorderPreloadBridge', {
    status: () => ipcRenderer.invoke('recorder:foundation-status'),
    invokeApi: (method, input) => ipcRenderer.invoke('recorder:api', method, input),
    files: { invoke: (method, input) => ipcRenderer.invoke('recorder:files', method, input), onProgress(listener) { const handler = (_event: unknown, value: import('@recorder/contracts').FileProgress) => listener(value); ipcRenderer.on('recorder:file-progress', handler); return () => { ipcRenderer.removeListener('recorder:file-progress', handler); }; } },
  } satisfies DesktopBridge);
}
const ctx = new Context();
void ctx.plugin(ipcBridge);
// One fixed, narrow platform ABI delegates to the active plugin provider.
contextBridge.exposeInMainWorld('recorder', {
  status: () => ctx.get('recorderPreloadBridge')?.status() ?? Promise.reject(new Error('Bridge unavailable')),
  invokeApi: (method: Parameters<DesktopBridge['invokeApi']>[0], input: unknown) => ctx.get('recorderPreloadBridge')?.invokeApi(method, input) ?? Promise.reject(new Error('Bridge unavailable')),
  files: { invoke: (method: import('@recorder/contracts').FileDeviceOperation, input: object) => ctx.get('recorderPreloadBridge')!.files!.invoke(method, input), onProgress: (listener: (value: import('@recorder/contracts').FileProgress) => void) => ctx.get('recorderPreloadBridge')!.files!.onProgress(listener) },
});
