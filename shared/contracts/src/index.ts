import type { ApiMethod } from './api.js';
export interface FoundationStatus {
  application: 'Recorder';
  stage: 'foundation';
  storage: { provider: string; value: number };
}
export interface StatusTransport {
  status(): Promise<FoundationStatus>;
}
export type ApiWireResult = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string; status: number } };
export interface DesktopBridge extends StatusTransport { invokeApi(method: ApiMethod, input: unknown): Promise<ApiWireResult> }
export function parseFoundationStatus(value: unknown): FoundationStatus {
  if (!value || typeof value !== 'object') throw new Error('Invalid diagnostic response');
  const input = value as Partial<FoundationStatus>;
  if (input.application !== 'Recorder' || input.stage !== 'foundation'
    || !input.storage || typeof input.storage.provider !== 'string'
    || !Number.isSafeInteger(input.storage.value)) throw new Error('Invalid diagnostic response');
  return input as FoundationStatus;
}
export * from './api.js';
