import type { Context } from '@deepseek-ai/cordis';
import { parseFoundationStatus, type StatusTransport } from '@recorder/contracts';
import './services.js';
export function fetchTransport(ctx: Context, config: { endpoint?: string } = {}) {
  const endpoint = config.endpoint ?? '/api/v1/plugins/foundation/operations/status';
  ctx.effect(() => {
    const controller = new AbortController();
    ctx.provide('recorderTransport', {
      async status() {
        const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' }, body: '{}', signal: controller.signal });
        if (!response.ok) throw new Error('Backend unavailable: ' + response.status);
        return parseFoundationStatus(await response.json());
      },
    } satisfies StatusTransport);
    return () => controller.abort();
  });
}
export function bridgeTransport(ctx: Context, config: { bridge: StatusTransport }) {
  ctx.provide('recorderTransport', {
    status: async () => parseFoundationStatus(await config.bridge.status()),
  } satisfies StatusTransport);
}
