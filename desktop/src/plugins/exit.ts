import type { Context } from '@deepseek-ai/cordis';
import { app, dialog } from 'electron';
import '../contracts.js';
export const inject = ['recorderWindow'];
export function apply(ctx: Context, config: { dispose: () => Promise<void> }) {
  ctx.effect(() => {
    const window = ctx.recorderWindow;
    const contents = window.webContents;
    let finishing = false;
    const finish = () => {
      if (finishing) return;
      finishing = true;
      // The window has already accepted beforeunload. Only now release the root.
      void config.dispose().finally(() => app.quit());
    };
    const beforeQuit = (event: Electron.Event) => {
      event.preventDefault();
      if (finishing) return;
      if (window.isDestroyed()) finish();
      else window.close();
    };
    const confirmLeave = (event: Electron.Event) => {
      const choice = dialog.showMessageBoxSync(window, {
        type: 'question', title: '尚有未保存的修改',
        message: '离开将丢弃当前窗口内存中的编辑草稿。',
        detail: '如果保存请求仍在处理，结果可能尚未确认。选择“继续编辑”可保留草稿。',
        buttons: ['继续编辑', '放弃草稿并离开'], defaultId: 0, cancelId: 0, noLink: true,
      });
      // Electron interprets preventDefault here as permission to unload.
      if (choice === 1) event.preventDefault();
    };
    app.on('before-quit', beforeQuit);
    app.on('window-all-closed', finish);
    window.on('closed', finish);
    contents.on('will-prevent-unload', confirmLeave);
    ctx.provide('recorderExit', { request: () => app.quit() });
    return () => {
      app.removeListener('before-quit', beforeQuit);
      app.removeListener('window-all-closed', finish);
      window.removeListener('closed', finish);
      contents.removeListener('will-prevent-unload', confirmLeave);
    };
  });
}
