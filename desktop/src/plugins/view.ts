import type { Context } from '@deepseek-ai/cordis';
import '../contracts.js';
export const inject = ['recorderWindow', 'recorderDesktopConnection'];
export async function apply(ctx: Context, config: { rendererUrl: string }) {
  await ctx.recorderWindow.loadURL(config.rendererUrl);
  ctx.provide('recorderDesktopView', { ready: true });
}
