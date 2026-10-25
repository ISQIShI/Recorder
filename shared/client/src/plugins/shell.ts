import type { Context } from '@deepseek-ai/cordis';
import { createApp, defineComponent, h } from 'vue';
import '../services.js';
export const inject = ['recorderPanels', 'recorderPlatform'];
export function apply(ctx: Context, config: { target: Element; application?: boolean }) {
  ctx.effect(() => {
    const app = createApp(defineComponent({
      setup: () => () => h('main', { class: 'workspace' }, [
        h('header', [
          h('span', { class: 'eyebrow' }, config.application ? 'RECORDER / YOUR SPACE' : 'RECORDER / FOUNDATION'),
          h('h1', config.application ? '记录片刻，随时找回' : '让能力自由组合'),
          h('p', (config.application ? '个人资料空间 · ' : '工程验证台 · ') + ctx.recorderPlatform.name),
          h('p', { class: 'muted' }, config.application ? '纯文本与 Markdown · 内容保存在当前连接的后端实例' : '当前使用隔离验证数据，尚未开放正式资料管理。'),
        ]),
        h('div', { class: 'panels' }, ctx.recorderPanels.items.map(panel =>
          h('section', { class: 'panel', key: panel.id, 'data-panel': panel.id }, [h(panel.component)]))),
      ]),
    }));
    try { app.mount(config.target); } catch (error) { app.unmount(); throw error; }
    return () => app.unmount();
  });
}
