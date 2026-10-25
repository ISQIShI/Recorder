import { type Context, type Fiber } from '@deepseek-ai/cordis';
import { defineComponent, h, ref } from 'vue';
import '../services.js';

const sample = {
  name: 'sample-panel', inject: ['recorderPanels'],
  apply(ctx: Context) {
    ctx.recorderPanels.register(ctx, { id: 'sample', component: defineComponent({
      setup: () => () => [h('span', { class: 'badge' }, '插件已启用'), h('h2', '一个可拔出的界面'), h('p', '移除这个插件，界面贡献会随生命周期撤回；重新启用后恢复。')],
    }) });
  },
};
export const inject = ['recorderPanels'];
export async function apply(ctx: Context) {
  let sampleFiber: Fiber | undefined = await ctx.plugin(sample);
  const enabled = ref(true);
  const busy = ref(false);
  ctx.recorderPanels.register(ctx, { id: 'lifecycle-controls', component: defineComponent({
    setup: () => () => [
      h('h2', '插件生命周期'),
      h('p', '这里直接调用 Cordis 启停插件，可观察界面装载与清理。'),
      h('button', { 'data-toggle-plugin': '', disabled: busy.value, onClick: async () => {
        busy.value = true;
        try {
          if (sampleFiber) { await sampleFiber.dispose(); sampleFiber = undefined; }
          else sampleFiber = await ctx.plugin(sample);
          enabled.value = Boolean(sampleFiber);
        } finally { busy.value = false; }
      } }, enabled.value ? '停用示例插件' : '启用示例插件'),
    ],
  }) });
}
