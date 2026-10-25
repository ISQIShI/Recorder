export interface FoundationStatus {
  application: 'Recorder';
  stage: 'foundation';
  storage: { provider: string; value: number };
}
export interface StatusTransport {
  status(): Promise<FoundationStatus>;
}
export interface DesktopBridge extends StatusTransport {}
export function parseFoundationStatus(value: unknown): FoundationStatus {
  if (!value || typeof value !== 'object') throw new Error('Invalid diagnostic response');
  const input = value as Partial<FoundationStatus>;
  if (input.application !== 'Recorder' || input.stage !== 'foundation'
    || !input.storage || typeof input.storage.provider !== 'string'
    || !Number.isSafeInteger(input.storage.value)) throw new Error('Invalid diagnostic response');
  return input as FoundationStatus;
}
