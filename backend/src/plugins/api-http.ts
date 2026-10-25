import type { Context } from '@deepseek-ai/cordis';
import Fastify, { type FastifyError } from 'fastify';
import { apiRoutes, apiResponses, type ApiMethod } from '@recorder/contracts';
import { failure, type Channel } from '../domain.js';
import '../contracts.js';
export const inject = ['recorderApiOperations', 'recorderAuth'];
export interface ApiHttpConfig { port?: number; listen?: boolean; allowedOrigins?: string[] }
export async function apply(ctx: Context, config: ApiHttpConfig = {}) {
  await ctx.effect(async () => {
    const server = Fastify({ logger: false, bodyLimit: 1024 * 1024, ajv: { customOptions: { removeAdditional: false } } });
    const allowed = new Set(config.allowedOrigins ?? ['http://127.0.0.1:5173', 'http://localhost:5173']);
    const attempts = new Map<string, { count: number; until: number }>();
    try {
      server.addHook('onRequest', async (request, reply) => {
        reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff');
        const host = request.headers.host ?? '';
        if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw failure(403, 'INVALID_HOST', '请求主机不受信任');
        if (request.headers.origin && !allowed.has(request.headers.origin)) throw failure(403, 'INVALID_ORIGIN', '请求来源不受信任');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers['x-recorder-request'] !== '1') throw failure(403, 'INVALID_REQUEST', '请求缺少来源标记');
        const requestPath = request.url.split('?', 1)[0];
        if (requestPath === '/api/v1/auth/login' || requestPath === '/api/v1/auth/setup') {
          const now = Date.now();
          for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
          const bucket = attempts.get(request.ip) ?? { count: 0, until: now + 5 * 60000 };
          attempts.set(request.ip, bucket);
          if (++bucket.count > 10) throw failure(429, 'RATE_LIMITED', '尝试过于频繁，请五分钟后重试');
        }
      });
      server.setErrorHandler((unknownError, _request, reply) => {
        const error = unknownError as FastifyError;
        const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
        reply.code(status).send({ code: error.validation ? 'INVALID_INPUT' : status === 500 ? 'INTERNAL_ERROR' : error.code ?? 'REQUEST_FAILED', message: error.validation ? '输入格式不正确' : status === 500 ? '请求失败，请检查后端状态' : error.message });
      });
      server.get('/healthz', async () => ({ application: 'Recorder', stage: 'records' }));
      const paths: Record<string, any> = {};
      for (const method of Object.keys(apiRoutes) as ApiMethod[]) {
        const route = apiRoutes[method];
        const path = route.path.replace(':id', '{id}');
        const properties = (route.input as { properties: Record<string, object>; required: readonly string[] });
        (paths[path] ??= {})[route.method.toLowerCase()] = {
          operationId: method, security: route.authenticated ? [{ cookieSession: [] }, { bearerSession: [] }] : [],
          ...(route.method === 'POST' ? { requestBody: { required: true, content: { 'application/json': { schema: route.input } } } }
            : { parameters: Object.entries(properties.properties).map(([name, schema]) => ({ name, in: method === 'getRecord' ? 'path' : 'query', required: properties.required.includes(name), schema })) }),
          responses: { '200': { description: 'Success', content: { 'application/json': { schema: apiResponses[method] } } }, '401': { description: 'Missing, expired or revoked session' }, '503': { description: 'Required plugin unavailable' } },
        };
        server.route({ method: route.method, url: route.path,
          schema: { ...(route.method === 'POST' ? { body: route.input } : method === 'getRecord' ? { params: route.input } : { querystring: route.input }), response: { 200: apiResponses[method] } },
          async handler(request, reply) {
            const authorization = request.headers.authorization;
            const cookies = (request.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith('recorder_session='));
            if (cookies.length > 1 || (authorization && cookies.length)) throw failure(400, 'AMBIGUOUS_CREDENTIALS', '请求包含冲突凭据');
            const channel: Channel = request.headers['x-recorder-client'] === 'native' && !request.headers.origin ? 'native' : 'web';
            if (channel === 'web' && authorization) throw failure(400, 'INVALID_CREDENTIALS_MODE', '浏览器应使用会话 Cookie');
            if (channel === 'native' && cookies.length) throw failure(400, 'INVALID_CREDENTIALS_MODE', '原生客户端应使用独立会话');
            if (channel === 'web' && route.method === 'POST' && !request.headers.origin) throw failure(403, 'ORIGIN_REQUIRED', '浏览器写请求需要来源校验');
            const token = channel === 'native' ? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : '') : cookies[0]?.slice('recorder_session='.length) ?? '';
            const principal = route.authenticated ? ctx.recorderAuth.authenticate(token, channel) : undefined;
            if (principal && channel === 'web' && route.method === 'POST' && request.headers['x-csrf-token'] !== ctx.recorderAuth.csrf(token)) throw failure(403, 'CSRF_REJECTED', '会话校验失败，请刷新后重试');
            const input = route.method === 'POST' ? request.body : method === 'getRecord' ? request.params : request.query;
            const result = await ctx.recorderApiOperations.call(method, { input, channel, ...(principal ? { principal } : {}) });
            if (result.token) {
              if (channel === 'web') reply.header('set-cookie', `recorder_session=${result.token}; HttpOnly; SameSite=Strict; Path=/api${result.remember ? '; Max-Age=2592000' : ''}`);
              else reply.header('x-recorder-session', result.token);
            }
            if (channel === 'web' && (result.token || principal)) reply.header('x-csrf-token', ctx.recorderAuth.csrf(result.token ?? token));
            if (result.clearSession) {
              reply.header('x-recorder-clear-session', '1');
              if (channel === 'web') reply.header('set-cookie', 'recorder_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');
            }
            return result.body;
          },
        });
      }
      server.get('/openapi.json', async () => ({ openapi: '3.1.0', info: { title: 'Recorder API', version: '0.1.0' }, paths, components: { securitySchemes: { cookieSession: { type: 'apiKey', in: 'cookie', name: 'recorder_session' }, bearerSession: { type: 'http', scheme: 'bearer' } } } }));
      await server.ready();
      const address = config.listen === false ? '' : await server.listen({ host: '127.0.0.1', port: config.port ?? 4317 });
      if (address) allowed.add(address);
      ctx.provide('recorderHttp', { server, address });
      return async () => { await server.close(); attempts.clear(); };
    } catch (error) { await server.close(); throw error; }
  });
}
