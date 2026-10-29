import type { Context } from '@deepseek-ai/cordis';
import Fastify, { type FastifyError } from 'fastify';
import { apiRoutes, apiResponses, attachmentSchema, MAX_ATTACHMENT_BYTES, type ApiMethod } from '@recorder/contracts';
import { failure } from '../domain.js';
import '../contracts.js';
import { authenticateHttp } from './http-auth.js';
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
      const transfers = new Set<AbortController>();
      server.addContentTypeParser('application/octet-stream', (_request, payload, done) => { done(null, payload); });
      const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' };
      for (const upload of [true, false]) {
        const path = upload ? '/api/v1/records/:id/attachments/:uploadId/content' : '/api/v1/attachments/:id/content';
        const params = { type: 'object', additionalProperties: false, required: upload ? ['id', 'uploadId'] : ['id'], properties: { id: uuid, ...(upload ? { uploadId: uuid } : {}) } };
        paths[path.replace(':id', '{id}').replace(':uploadId', '{uploadId}')] = { [upload ? 'put' : 'get']: {
          operationId: upload ? 'uploadAttachment' : 'downloadAttachment', security: [{ cookieSession: [] }, { bearerSession: [] }],
          parameters: [...(upload ? ['id', 'uploadId'] : ['id']).map(name => ({ name, in: 'path', required: true, schema: uuid })), ...(upload ? [{ name: 'x-recorder-filename', in: 'header', required: true, description: 'encodeURIComponent(original filename), no client path', schema: { type: 'string' } }, { name: 'x-recorder-media-type', in: 'header', schema: { type: 'string' } }] : [])],
          ...(upload ? { requestBody: { required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary', description: 'Streaming; actual bytes limited to 1 GiB' } } } } } : {}),
          responses: { '200': { description: upload ? 'Committed attachment, or same upload replay' : 'Authenticated download; Content-Disposition attachment and x-recorder-digest SHA-256', content: upload ? { 'application/json': { schema: attachmentSchema } } : { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, '400': { description: 'Invalid input/credential mode' }, '401': { description: 'Session invalid' }, '403': { description: 'Host/Origin/CSRF rejected' }, '404': { description: 'Record/attachment missing or another owner' }, '409': { description: 'Trashed record, upload conflict or already in progress' }, '413': { description: 'Actual file exceeds limit' }, '503': { description: 'Attachment provider unavailable' } },
        } };
        server.route({ method: upload ? 'PUT' : 'GET', url: path, bodyLimit: MAX_ATTACHMENT_BYTES, schema: { params },
          onRequest: async request => { authenticateHttp(ctx.recorderAuth, request, upload); if (upload && request.headers['content-type'] !== 'application/octet-stream') throw failure(415, 'INVALID_FILE_TYPE', '文件传输须使用二进制通道'); if (upload && Number(request.headers['content-length']) > MAX_ATTACHMENT_BYTES) throw failure(413, 'FILE_TOO_LARGE', '附件超过单文件上限'); },
          async handler(request, reply) {
            const control = new AbortController(); transfers.add(control);
            const abort = () => control.abort(); const close = () => { if (!reply.raw.writableFinished) abort(); };
            request.raw.once('aborted', abort); reply.raw.once('close', close);
            try {
              const input = request.params as { id: string; uploadId?: string };
              let name: string | undefined; try { if (upload) name = decodeURIComponent(String(request.headers['x-recorder-filename'] ?? '')); } catch { throw failure(400, 'INVALID_FILE', '文件名称编码不正确'); }
              const result = await ctx.recorderApiOperations.callFile(upload ? 'uploadAttachment' : 'downloadAttachment', { ...input, name, mediaType: request.headers['x-recorder-media-type'] as string | undefined, stream: upload ? request.body as import('node:stream').Readable : request.raw, signal: control.signal, authenticate: () => authenticateHttp(ctx.recorderAuth, request, upload).principal! });
              if (result.stream) {
                const attachment = result.attachment!;
                reply.type('application/octet-stream').header('content-length', attachment.bytes).header('x-recorder-digest', attachment.digest).header('content-disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(attachment.name));
                result.stream.once('close', () => { transfers.delete(control); });
                control.signal.addEventListener('abort', () => result.stream!.destroy(), { once: true });
                return reply.send(result.stream);
              }
              transfers.delete(control); return result.body;
            } catch (error) { transfers.delete(control); throw error; }
            finally { request.raw.removeListener('aborted', abort); }
          },
        });
      }
      for (const method of Object.keys(apiRoutes) as ApiMethod[]) {
        const route = apiRoutes[method];
        const path = route.path.replace(':id', '{id}');
        const properties = (route.input as { properties: Record<string, object>; required: readonly string[] });
        const writes = route.method !== 'GET';
        const parameters = (schema: { properties: Record<string, object>; required: readonly string[] }, location: 'path' | 'query') =>
          Object.entries(schema.properties).map(([name, value]) => ({ name, in: location, required: schema.required.includes(name), schema: value }));
        (paths[path] ??= {})[route.method.toLowerCase()] = {
          operationId: method, security: route.authenticated ? [{ cookieSession: [] }, { bearerSession: [] }] : [],
          parameters: [...('params' in route ? parameters(route.params, 'path') : []), ...(!writes ? parameters(properties, 'query') : [])],
          ...(writes ? { requestBody: { required: true, content: { 'application/json': { schema: route.input } } } } : {}),
          responses: { '200': { description: 'Success', content: { 'application/json': { schema: apiResponses[method] } } },
            '400': { description: 'Invalid input or ambiguous credentials' }, '401': { description: 'Missing, expired or revoked session' },
            '403': { description: 'Host, Origin, request marker or CSRF rejected' },
            ...(['getRecord', 'updateRecord', 'trashRecord', 'restoreRecord'].includes(method) ? { '404': { description: 'NOT_FOUND: record missing or owned by another account' } } : {}),
            ...(['updateRecord', 'trashRecord', 'restoreRecord'].includes(method) ? { '409': { description: 'REVISION_CONFLICT: expectedRevision is stale; RECORD_TRASHED: body update is forbidden in trash; no changes written' } } : {}),
            ...(['getRecordTags', 'addRecordTag', 'removeRecordTag', 'listTagRecords'].includes(method) ? { '404': { description: 'NOT_FOUND: record or tag missing or owned by another account' } } : {}),
            ...(['addRecordTag', 'removeRecordTag'].includes(method) ? { '409': { description: 'RECORD_TRASHED: tag associations are read-only in trash' } } : {}),
            ...(['createCategory', 'updateCategory', 'deleteCategory', 'getRecordCategories', 'addRecordCategory', 'removeRecordCategory', 'listCategoryRecords'].includes(method) ? { '404': { description: 'NOT_FOUND: record, category or parent missing or owned by another account' } } : {}),
            ...(['createCategory', 'updateCategory', 'deleteCategory', 'addRecordCategory', 'removeRecordCategory'].includes(method) ? { '409': { description: 'REVISION_CONFLICT, CATEGORY_NAME_CONFLICT, CATEGORY_CYCLE or RECORD_TRASHED; no changes written' } } : {}),
            ...(['listAttachments', 'deleteAttachment'].includes(method) ? { '404': { description: 'NOT_FOUND: record or attachment missing or owned by another account' } } : {}),
            ...(method === 'deleteAttachment' ? { '409': { description: 'RECORD_TRASHED: attachments are read-only in trash' } } : {}),
            '503': { description: 'Required plugin unavailable' } },
        };
        server.route({ method: route.method, url: route.path,
          schema: { ...('params' in route ? { params: route.params } : {}), ...(writes ? { body: route.input } : { querystring: route.input }), response: { 200: apiResponses[method] } },
          preValidation: async request => {
            // Reject coercion of JSON update fields; GET query coercion remains unchanged.
            if (['updateRecord', 'trashRecord', 'restoreRecord'].includes(method)) {
              const body = request.body as Record<string, unknown> | null;
              if (!body || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1
                || (method === 'updateRecord' && !['title', 'body', 'format'].every(key => typeof body[key] === 'string'))) throw failure(400, 'INVALID_INPUT', '输入格式不正确');
            }
            if (['emptyTrash', 'deleteAttachment'].includes(method) && (request.body as { confirm?: unknown } | null)?.confirm !== true) throw failure(400, 'CONFIRMATION_REQUIRED', '永久删除需要明确确认');
            if (method === 'createTag' && typeof (request.body as { name?: unknown } | null)?.name !== 'string') throw failure(400, 'INVALID_INPUT', '标签名须为文本');
            if (['addRecordTag', 'removeRecordTag'].includes(method) && typeof (request.body as { tagId?: unknown } | null)?.tagId !== 'string') throw failure(400, 'INVALID_INPUT', '标签 ID 须为文本');
            if (['createCategory', 'updateCategory', 'deleteCategory', 'addRecordCategory', 'removeRecordCategory'].includes(method)) {
              const body = request.body as Record<string, unknown> | null;
              if (!body || (['createCategory', 'updateCategory'].includes(method) && (typeof body.name !== 'string' || !(body.parentId === null || (typeof body.parentId === 'string' && body.parentId.length > 0))))
                || (['updateCategory', 'deleteCategory'].includes(method) && (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1))
                || (['addRecordCategory', 'removeRecordCategory'].includes(method) && typeof body.categoryId !== 'string')) throw failure(400, 'INVALID_INPUT', '分类输入格式不正确');
              if (method === 'deleteCategory' && body.confirm !== true) throw failure(400, 'CONFIRMATION_REQUIRED', '删除整棵分类树需要明确确认，所有记录保留');
            }
          },
          async handler(request, reply) {
            const { token, channel, principal } = authenticateHttp(ctx.recorderAuth, request, writes, route.authenticated);
            const input = { ...(writes ? request.body as object : request.query as object), ...('params' in route ? request.params as object : {}) };
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
      return async () => { for (const transfer of transfers) transfer.abort(); await server.close(); attempts.clear(); };
    } catch (error) { await server.close(); throw error; }
  });
}
