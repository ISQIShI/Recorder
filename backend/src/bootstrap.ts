import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import type { HttpConfig } from './plugins/http.js';
import './contracts.js';

export interface BackendOptions {
  filename?: string;
  http?: HttpConfig;
  entries?: EntryOptions[];
}
export async function createBackend(options: BackendOptions = {}) {
  const ctx = new Context();
  try {
    await ctx.plugin(Loader, { baseUrl: import.meta.url });
    // Configuration names providers; the bootstrap has no business implementation.
    const entries: EntryOptions[] = options.entries ?? [
      { id: 'operations', name: './plugins/operations.js' },
      { id: 'status', name: './plugins/status.js' },
      { id: 'storage', name: './plugins/sqlite.js', config: { filename: options.filename } },
      { id: 'http', name: './plugins/http.js', config: options.http ?? {} },
    ];
    await ctx.loader.root.update(entries);
    await ctx.loader.await();
    for (const entry of ctx.loader.entries()) {
      if (!entry.disabled && !entry.fiber) throw new Error('Plugin import failed: ' + entry.options.name);
      await entry.fiber?.await();
    }
    return ctx;
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}
