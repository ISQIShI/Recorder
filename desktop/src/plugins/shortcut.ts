import type { Context } from '@deepseek-ai/cordis';
import { globalShortcut } from 'electron';
import '../contracts.js';
export const inject = ['recorderWindow'];
export function apply(ctx: Context, config: { enabled: boolean }) {
  ctx.effect(() => {
    const accelerator = 'CommandOrControl+Shift+Space';
    const registered = config.enabled && globalShortcut.register(accelerator, () => {
      const window = ctx.recorderWindow;
      if (window.isMinimized()) window.restore();
      window.show(); window.focus();
    });
    ctx.provide('recorderShortcut', { registered });
    return () => { if (registered) globalShortcut.unregister(accelerator); };
  });
}
