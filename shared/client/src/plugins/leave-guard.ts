import type { Context } from '@deepseek-ai/cordis';
import { computed, shallowReactive, watch } from 'vue';

export interface LeaveGuard {
  readonly dirty: boolean;
  register(owner: Context, dirty: () => boolean): void;
  confirm(): boolean;
}
declare module '@deepseek-ai/cordis' { interface Context { recorderLeave: LeaveGuard } }
type LeaveTarget = Pick<Window, 'addEventListener' | 'removeEventListener' | 'confirm'>;
export function apply(ctx: Context, config: { target?: LeaveTarget } = {}) {
  const target = config.target ?? window;
  const guards = shallowReactive(new Set<() => boolean>());
  const dirty = computed(() => [...guards].some(check => check()));
  const beforeUnload = (event: Event) => {
    if (!dirty.value) return;
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = '';
  };
  ctx.effect(() => {
    const stop = watch(dirty, value => {
      target.removeEventListener('beforeunload', beforeUnload);
      if (value) target.addEventListener('beforeunload', beforeUnload);
    }, { immediate: true, flush: 'sync' });
    return () => { stop(); target.removeEventListener('beforeunload', beforeUnload); guards.clear(); };
  });
  ctx.provide('recorderLeave', {
    get dirty() { return dirty.value; },
    register(owner, check) { owner.effect(() => { guards.add(check); return () => { guards.delete(check); }; }); },
    confirm: () => !dirty.value || target.confirm('编辑草稿仅在当前窗口内存中，尚有未保存的修改。离开将丢弃草稿；如有请求仍在处理，保存结果可能尚未确认。仍要离开吗？'),
  } satisfies LeaveGuard);
}
