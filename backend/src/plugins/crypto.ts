import type { Context } from '@deepseek-ai/cordis';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { failure, type CryptoProvider } from '../domain.js';
const N = 131072, r = 8, p = 1;
export function apply(ctx: Context) {
  let running = 0;
  async function derive(password: string, salt: string) {
    if (running >= 2) throw failure(503, 'AUTH_BUSY', '认证繁忙，请稍后重试');
    running++;
    try { return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key))); }
    finally { running--; }
  }
  ctx.provide('recorderCrypto', {
    id: randomUUID, token: () => randomBytes(32).toString('base64url'),
    digest: value => createHash('sha256').update(value).digest('hex'),
    async hash(password) {
      const salt = randomBytes(16).toString('hex');
      return `scrypt$${N}$${r}$${p}$${salt}$${(await derive(password, salt)).toString('hex')}`;
    },
    async verify(password, hash) {
      const parts = hash.split('$');
      if (parts.length !== 6 || parts.slice(0, 4).join('$') !== `scrypt$${N}$${r}$${p}` || !/^[0-9a-f]{32}$/.test(parts[4]!) || !/^[0-9a-f]{64}$/.test(parts[5]!)) return false;
      return timingSafeEqual(await derive(password, parts[4]!), Buffer.from(parts[5]!, 'hex'));
    },
  } satisfies CryptoProvider);
}
