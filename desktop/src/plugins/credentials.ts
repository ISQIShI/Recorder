import type { Context } from '@deepseek-ai/cordis';
import { safeStorage, app } from 'electron';
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export interface CredentialStore { load(backend: string): Promise<string | undefined>; save(backend: string, token?: string): Promise<void> }
declare module '@deepseek-ai/cordis' { interface Context { recorderCredentials: CredentialStore } }
export function apply(ctx: Context) {
  const directory = join(app.getPath('userData'), 'sessions');
  const path = (backend: string) => join(directory, createHash('sha256').update(backend).digest('hex') + '.bin');
  function available() {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('系统安全存储不可用，请取消“记住登录”后重试');
  }
  ctx.provide('recorderCredentials', {
    async load(backend) {
      let encrypted: Buffer;
      try { encrypted = await readFile(path(backend)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
      available();
      return safeStorage.decryptString(encrypted);
    },
    async save(backend, token) {
      const file = path(backend);
      if (!token) { try { await unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } return; }
      available();
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(file + '.tmp', safeStorage.encryptString(token), { mode: 0o600 });
      await rename(file + '.tmp', file);
    },
  } satisfies CredentialStore);
}
