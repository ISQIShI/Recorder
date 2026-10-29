import type Database from 'better-sqlite3';
import type { Readable } from 'node:stream';
import type { AttachmentData } from '@recorder/contracts';
export interface ManagedObject { objectId: string; bytes: number; digest: string }
export interface ManagedFiles {
  readonly root: string;
  list(owner: string, recordId: string): AttachmentData[];
  get(owner: string, id: string): AttachmentData & { recordId: string };
  recordId(owner: string, id: string): string | null;
  receive(input: { owner: string; recordId: string; id: string; name: string; mediaType: string }, stream: Readable, validate: () => void, signal: AbortSignal): Promise<AttachmentData>;
  download(owner: string, id: string): Readable;
  remove(owner: string, id: string, validate: () => void): Promise<{ deleted: boolean; pending: boolean }>;
  cleanup(): Promise<void>;
  inventory(raw: Database.Database): ManagedObject[];
  copy(objects: ManagedObject[], from: string, to: string, signal: AbortSignal, progress?: (bytes: number) => void): Promise<void>;
  verify(objects: ManagedObject[], directory: string, signal?: AbortSignal): Promise<void>;
}
export interface FileCall { id: string; uploadId?: string; name?: string; mediaType?: string; stream: Readable; signal: AbortSignal; authenticate(): import('./domain.js').Principal }
export interface FileResult { body?: AttachmentData; stream?: Readable; attachment?: AttachmentData }
export interface AttachmentService {
  list(principal: import('./domain.js').Principal, id: string): { items: AttachmentData[] };
  remove(principal: import('./domain.js').Principal, id: string, confirm: boolean): Promise<{ deleted: boolean; pending: boolean }>;
  upload(call: FileCall): Promise<FileResult>; download(call: FileCall): Promise<FileResult>;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderManagedFiles: ManagedFiles; recorderAttachments: AttachmentService } }
