import type { ApiWireResult } from './index.js';
export interface ChosenFile { handle: string; name: string; bytes: number }
export interface FileProgress { id: string; phase: 'upload' | 'download'; bytes: number; total: number }
export type FileDeviceOperation = 'choose' | 'upload' | 'save' | 'cancel' | 'clear';
export interface FileDeviceBridge {
  invoke(method: FileDeviceOperation, input: object): Promise<ApiWireResult>;
  onProgress(listener: (progress: FileProgress) => void): () => void;
}
