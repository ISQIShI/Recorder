import type { Context } from '@deepseek-ai/cordis';
import type { Credentials } from '@recorder/contracts';
import { writeFileSync, unlinkSync } from 'node:fs';
import { failure, type AuthService, type Channel, type User } from '../domain.js';
export const inject = ['recorderIdentityStore', 'recorderCrypto'];
export interface AuthConfig { setupFile?: string; setupCode?: string }
export async function apply(ctx: Context, config: AuthConfig = {}) {
  const store = ctx.recorderIdentityStore, crypto = ctx.recorderCrypto;
  let active = true;
  ctx.effect(() => () => { active = false; });
  const available = () => { if (!active) throw failure(503, 'AUTH_UNAVAILABLE', '认证插件已停用'); };
  const setupCode = config.setupCode ?? crypto.token();
  if (!store.initialized() && config.setupFile) writeFileSync(config.setupFile, setupCode, { mode: 0o600 });
  const dummyHash = await crypto.hash(crypto.token());
  available();
  function validate(input: Credentials) {
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(input.username) || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128
      || typeof input.remember !== 'boolean' || typeof input.clientName !== 'string' || !input.clientName.trim() || input.clientName.length > 80) throw failure(400, 'INVALID_INPUT', '账号、密码或设备名称格式不正确');
  }
  function issue(user: User, input: Credentials, channel: Channel) {
    available();
    const token = crypto.token(), id = crypto.id(), now = Date.now();
    const expiresAt = now + (input.remember ? 30 * 24 : 12) * 3600000;
    store.createSession({ id, userId: user.id, tokenHash: crypto.digest(token), channel, clientName: input.clientName.trim(), createdAt: now, expiresAt });
    return { token, identity: { userId: user.id, username: user.username, sessionId: id, expiresAt, channel } };
  }
  ctx.provide('recorderAuth', {
    info: () => ({ initialized: store.initialized(), instanceId: store.instanceId }),
    async login(input, channel) {
      validate(input);
      const user = store.user(input.username.toLowerCase());
      const valid = await crypto.verify(input.password, user?.passwordHash ?? dummyHash);
      available();
      if (!valid || !user) throw failure(401, 'INVALID_CREDENTIALS', '账号或密码不正确');
      return issue(user, input, channel);
    },
    async setup(input, channel) {
      validate(input);
      if (store.initialized()) throw failure(409, 'ALREADY_INITIALIZED', '账号已初始化，请登录');
      if (crypto.digest(input.setupCode) !== crypto.digest(setupCode)) throw failure(403, 'INVALID_SETUP_CODE', '初始化码不正确');
      const user = { id: crypto.id(), username: input.username.toLowerCase(), passwordHash: await crypto.hash(input.password), createdAt: Date.now() };
      available();
      store.createOwner(user);
      if (config.setupFile) { try { unlinkSync(config.setupFile); } catch { /* The endpoint is already closed by persisted owner state. */ } }
      return issue(user, input, channel);
    },
    authenticate(token, channel) {
      available();
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw failure(401, 'UNAUTHENTICATED', '请重新登录');
      const identity = store.resolve(crypto.digest(token), channel, Date.now());
      if (!identity) throw failure(401, 'UNAUTHENTICATED', '登录已过期或被撤销');
      return identity;
    },
    csrf: token => crypto.digest('recorder-csrf:' + token),
    sessions: principal => store.list(principal.userId, principal.sessionId, Date.now()),
    revoke: (principal, id) => { store.revoke(principal.userId, id, Date.now()); },
  } satisfies AuthService);
}
