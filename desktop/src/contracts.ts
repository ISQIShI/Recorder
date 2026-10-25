import type { Context } from '@deepseek-ai/cordis';
import type { BrowserWindow } from 'electron';
export type DesktopContext = Context;
declare module '@deepseek-ai/cordis' {
  interface Context {
    recorderWindow: BrowserWindow;
    recorderDesktopConnection: { ready: true };
    recorderDesktopView: { ready: true };
    recorderShortcut: { registered: boolean };
    recorderExit: { request(): void };
  }
}
