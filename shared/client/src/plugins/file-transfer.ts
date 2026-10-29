import type { Context } from '@deepseek-ai/cordis';
import { ApiError, isAttachment, type AttachmentData, type ChosenFile, type FileDeviceBridge, type FileProgress } from '@recorder/contracts';
export interface FileTransfer {
  available: boolean; choose(): Promise<ChosenFile | undefined>;
  upload(file: ChosenFile, recordId: string, uploadId: string, signal: AbortSignal, progress: (value: FileProgress) => void): Promise<AttachmentData>;
  save(id: string, signal: AbortSignal, progress: (value: FileProgress) => void): Promise<boolean>; clear(): void;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderFileTransfer: FileTransfer } }
export function apply(ctx: Context, config: { bridge?: FileDeviceBridge } = {}) {
  ctx.effect(() => {
    const bridge = config.bridge, listeners = new Map<string, (value: FileProgress) => void>();
    const stop = bridge?.onProgress(value => listeners.get(value.id)?.(value));
    async function invoke(method: Parameters<FileDeviceBridge['invoke']>[0], input: object) { if (!bridge) throw new ApiError('DEVICE_UNAVAILABLE', '当前客户端尚无文件设备适配，请使用 Windows 桌面。', 503); const result = await bridge.invoke(method, input); if (!result.ok) throw new ApiError(result.error.code, result.error.message, result.error.status); return result.value; }
    async function transfer(method: 'upload' | 'save', input: object, signal: AbortSignal, progress: (value: FileProgress) => void) {
      const transferId = crypto.randomUUID(); signal.throwIfAborted(); listeners.set(transferId, progress);
      const cancel = () => { void invoke('cancel', { transferId }).catch(() => {}); }; signal.addEventListener('abort', cancel, { once: true });
      try { return await invoke(method, { ...input, transferId }); } finally { signal.removeEventListener('abort', cancel); listeners.delete(transferId); }
    }
    const clear = () => { listeners.clear(); if (bridge) void invoke('clear', {}).catch(() => {}); };
    ctx.provide('recorderFileTransfer', { available: !!bridge,
      async choose() { const result = await invoke('choose', {}) as ChosenFile | undefined; if (result && (typeof result.handle !== 'string' || typeof result.name !== 'string' || !Number.isSafeInteger(result.bytes) || result.bytes < 0)) throw new ApiError('INVALID_RESPONSE', '文件选择结果不正确', 502); return result; },
      async upload(file, recordId, uploadId, signal, progress) { const result = await transfer('upload', { handle: file.handle, recordId, uploadId }, signal, progress); if (!isAttachment(result)) throw new ApiError('INVALID_RESPONSE', '上传结果尚未确认，请刷新附件', 502); return result; },
      async save(id, signal, progress) { const result = await transfer('save', { id }, signal, progress); if (typeof result !== 'boolean') throw new ApiError('INVALID_RESPONSE', '另存结果不正确', 502); return result; }, clear,
    } satisfies FileTransfer);
    return () => { stop?.(); clear(); };
  });
}
