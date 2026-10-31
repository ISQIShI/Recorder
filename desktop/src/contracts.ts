import type { Context } from '@deepseek-ai/cordis';
import type { BrowserWindow } from 'electron';
export type DesktopContext = Context;
declare module '@deepseek-ai/cordis' {
  interface Context {
    recorderWindow: BrowserWindow;
    recorderDesktopConnection: {
      ready: true; assertSender(event: import('electron').IpcMainInvokeEvent): void;
      onSessionChange(listener: () => void): () => void;
      file(input: { kind: 'upload' | 'download'; id: string; uploadId?: string; name?: string; bytes?: number }, body: import('node:stream').Readable | undefined, signal: AbortSignal): Promise<Response>;
    };
    recorderDesktopView: { ready: true };
    recorderShortcut: { registered: boolean };
    recorderExit: { request(): void };
  }
}
