import type { Context } from '@deepseek-ai/cordis';
import { defineComponent, h, ref, watch, onBeforeUnmount } from 'vue';
import type { SessionData } from '@recorder/contracts';
import './account.js';
import '../services.js';
export const inject = ['recorderPanels', 'recorderAccount', 'recorderApi', 'recorderPlatform', 'recorderLeave'];
export function apply(ctx: Context) {
  ctx.recorderPanels.register(ctx, { id: 'account', component: defineComponent({ setup() {
    const username = ref(''), password = ref(''), setupCode = ref(''), remember = ref(true), busy = ref(false), error = ref('');
    const sessions = ref<SessionData[]>([]);
    let active = true;
    onBeforeUnmount(() => { active = false; password.value = ''; setupCode.value = ''; });
    const account = ctx.recorderAccount;
    watch(() => account.state.identity?.sessionId, () => { sessions.value = []; error.value = ''; busy.value = false; }, { flush: 'sync' });
    async function loadSessions() {
      const session = account.state.identity?.sessionId;
      const result = await ctx.recorderApi.request('sessions', {});
      if (active && session === account.state.identity?.sessionId) sessions.value = result.items;
    }
    async function run(action: () => Promise<void>) {
      if (busy.value) return;
      const session = account.state.identity?.sessionId;
      busy.value = true; error.value = '';
      try { await action(); } catch (e) { if (active && session === account.state.identity?.sessionId) error.value = account.error(e); }
      finally { if (active && session === account.state.identity?.sessionId) busy.value = false; }
    }
    const input = (label: string, key: string, value: typeof username, type = 'text') => h('label', [label, h('input', { name: key, type, value: value.value, autocomplete: key === 'username' ? 'username' : type === 'password' ? 'current-password' : 'off', onInput: (e: Event) => { value.value = (e.target as HTMLInputElement).value; } })]);
    return () => {
      const state = account.state;
      if (!state.ready) return h('p', '正在连接后端…');
      if (state.error) return [h('p', { role: 'alert' }, state.error), h('button', { onClick: () => account.refresh() }, '重新连接')];
      if (state.identity) return [
        h('div', { class: 'account-summary', 'data-signed-in': '' }, [h('div', [h('span', { class: 'badge' }, '已登录'), h('h2', state.identity.username)]),
          h('div', { class: 'actions' }, [h('button', { disabled: busy.value, onClick: () => run(loadSessions) }, '登录会话'),
            h('button', { 'data-logout': '', disabled: busy.value, onClick: () => run(async () => { await account.logout(); }) }, '退出登录')])]),
        ...sessions.value.map(s => h('div', { class: 'session-row', key: s.id }, [h('span', `${s.clientName}${s.current ? ' · 当前会话' : ''}`), h('button', { disabled: busy.value, onClick: () => run(async () => {
          if (s.current && !ctx.recorderLeave.confirm()) return;
          const session = account.state.identity?.sessionId;
          await ctx.recorderApi.request('revoke', { sessionId: s.id });
          if (!active || account.state.identity?.sessionId !== session) return;
          if (s.current) { account.state.identity = undefined; sessions.value = []; }
          else await loadSessions();
        }) }, '撤销') ])), h('p', { role: 'alert' }, error.value),
      ];
      const setup = state.info?.initialized === false;
      return [h('h2', setup ? '建立你的账号' : '欢迎回来'), h('p', setup ? '从后端数据目录的 setup-code.txt 取得初始化码。密码至少 12 个字符。' : '登录此 Recorder 实例，继续保存和查找记录。'),
        h('form', { onSubmit: (e: Event) => { e.preventDefault(); void run(async () => {
          const credentials = { username: username.value, password: password.value, remember: remember.value, clientName: ctx.recorderPlatform.name };
          try { await account.login(credentials, setup ? setupCode.value : undefined); } finally { password.value = ''; }
          setupCode.value = '';
        }); } }, [
          setup ? input('初始化码', 'setupCode', setupCode, 'password') : null,
          input('用户名（字母、数字、下划线、点或连字符）', 'username', username), input('密码', 'password', password, 'password'),
          h('label', { class: 'check' }, [h('input', { type: 'checkbox', checked: remember.value, onChange: (e: Event) => { remember.value = (e.target as HTMLInputElement).checked; } }), '记住登录（30 天，可随时撤销）']),
          h('button', { type: 'submit', 'data-login-submit': '', disabled: busy.value }, busy.value ? '正在处理…' : setup ? '创建账号并登录' : '登录'),
          h('p', { role: 'alert' }, error.value),
        ]),
      ];
    };
  } }) });
}
