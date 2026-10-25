import type { Context } from '@deepseek-ai/cordis';
import { createApp, defineComponent, h } from 'vue';
import '../services.js';
export const inject = ['recorderPanels', 'recorderPlatform'];
export function apply(ctx: Context, config: { target: Element }) {
  ctx.effect(() => {
    const app = createApp(defineComponent({
      setup: () => () => h('main', { class: 'workspace' }, [
        h('header', [
          h('span', { class: 'eyebrow' }, 'RECORDER / FOUNDATION'),
          h('h1', '让能力自由组合'),
          h('p', '工程验证台 · ' + ctx.recorderPlatform.name),
          h('p', { class: 'muted' }, '当前使用隔离验证数据，尚未开放正式资料管理。'),
        ]),
        h('div', { class: 'panels' }, ctx.recorderPanels.items.map(panel =>
          h('section', { class: 'panel', key: panel.id, 'data-panel': panel.id }, [h(panel.component)]))),
      ]),
    }));
    try { app.mount(config.target); } catch (error) { app.unmount(); throw error; }
    return () => app.unmount();
  });
}
