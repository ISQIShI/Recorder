import type { Context } from '@deepseek-ai/cordis';
import Fastify from 'fastify';
import '../contracts.js';

export const inject = ['recorderOperations'];
export interface HttpConfig { port?: number; listen?: boolean }
export async function apply(ctx: Context, config: HttpConfig = {}) {
  await ctx.effect(async () => {
    const server = Fastify({ logger: false, bodyLimit: 4096 });
    try {
      server.get('/healthz', async () => ({ application: 'Recorder', stage: 'foundation' }));
      server.get('/openapi.json', async () => ({
        openapi: '3.1.0',
        info: { title: 'Recorder foundation diagnostics', version: '0.0.0' },
        paths: { '/api/v1/plugins/foundation/operations/status': { post: {
          summary: 'Read isolated foundation probe (not a business API)',
          responses: { '200': { description: 'Foundation diagnostic status' }, '404': { description: 'Plugin unavailable' } },
        } } },
      }));
      server.post<{ Params: { plugin: string; operation: string } }>(
        '/api/v1/plugins/:plugin/operations/:operation',
        { schema: { body: { type: 'object', additionalProperties: false } } },
        async (request) => ctx.recorderOperations.call(request.params.plugin + '/' + request.params.operation),
      );
      await server.ready();
      const address = config.listen === false ? '' : await server.listen({ host: '127.0.0.1', port: config.port ?? 4317 });
      ctx.provide('recorderHttp', { server, address });
      return async () => { await server.close(); };
    } catch (error) { await server.close(); throw error; }
  });
}
