import type { Context } from '@deepseek-ai/cordis';
import { apiRoutes, ApiError, parseApiResponse, type ApiTransport, type ApiMethod, type ApiInputs } from '@recorder/contracts';
export function apiRequest(method: ApiMethod, input: any) {
  const route = apiRoutes[method];
  const path = route.path.replace(':id', encodeURIComponent(input.id ?? ''));
  const query = route.method === 'GET' && method !== 'getRecord' ? new URLSearchParams(Object.entries(input).map(([k, v]) => [k, String(v)])).toString() : '';
  return { path: path + (query ? '?' + query : ''), method: route.method, ...(route.method === 'POST' ? { body: JSON.stringify(input) } : {}) };
}
export function webApi(ctx: Context) {
  ctx.effect(() => {
    const controller = new AbortController();
    let csrf = '';
    ctx.provide('recorderApi', {
      async request<K extends ApiMethod>(method: K, input: ApiInputs[K]) {
        const request = apiRequest(method, input);
        const response = await fetch(request.path, { ...request, credentials: 'same-origin', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          headers: { 'content-type': 'application/json', 'x-recorder-request': '1', ...(csrf ? { 'x-csrf-token': csrf } : {}) } });
        const body = await response.json();
        if (!response.ok) throw new ApiError(body.code ?? 'REQUEST_FAILED', body.message ?? '请求失败', response.status);
        csrf = response.headers.get('x-csrf-token') ?? csrf;
        if (response.headers.get('x-recorder-clear-session')) csrf = '';
        return parseApiResponse(method, body);
      },
    } satisfies ApiTransport);
    return () => controller.abort();
  });
}
export function nativeApi(ctx: Context, config: { bridge: ApiTransport }) {
  ctx.provide('recorderApi', { request: async (method, input) => parseApiResponse(method, await config.bridge.request(method, input)) } satisfies ApiTransport);
}
declare module '@deepseek-ai/cordis' { interface Context { recorderApi: ApiTransport } }
