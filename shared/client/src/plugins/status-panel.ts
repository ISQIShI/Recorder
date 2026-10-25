import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h, onMounted, onUnmounted, ref } from 'vue';
import '../services.js';
export const inject = ['recorderPanels', 'recorderTransport'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'backend-status', component: defineComponent({
    setup() {
      const message = ref('正在连接…');
      let active = true;
      let requestVersion = 0;
      onUnmounted(() => { active = false; });
      const refresh = async () => {
        const version = ++requestVersion;
        message.value = '正在连接…';
        try {
          const result = await ctx.recorderTransport.status();
          if (active && version === requestVersion) message.value = '后端已连接 · ' + result.storage.provider + ' · 验证值 ' + result.storage.value;
        } catch {
          if (active && version === requestVersion) message.value = '后端尚未连接；请启动验证服务或配置平台连接。';
        }
      };
      onMounted(refresh);
      return () => [
        h('h2', '统一后端'),
        h('p', { 'data-status': '' }, message.value),
        h('button', { onClick: refresh }, '重新连接'),
      ];
    },
  }) });
}
