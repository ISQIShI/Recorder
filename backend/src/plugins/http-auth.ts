import type { FastifyRequest } from 'fastify';
import { failure, type AuthService, type Channel } from '../domain.js';
/** Shared credential/CSRF rules for JSON operations and streaming file routes. */
export function authenticateHttp(auth: AuthService, request: FastifyRequest, writes: boolean, required = true) {
  const authorization = request.headers.authorization;
  const cookies = (request.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith('recorder_session='));
  if (cookies.length > 1 || (authorization && cookies.length)) throw failure(400, 'AMBIGUOUS_CREDENTIALS', '请求包含冲突凭据');
  const channel: Channel = request.headers['x-recorder-client'] === 'native' && !request.headers.origin ? 'native' : 'web';
  if (channel === 'web' && authorization) throw failure(400, 'INVALID_CREDENTIALS_MODE', '浏览器应使用会话 Cookie');
  if (channel === 'native' && cookies.length) throw failure(400, 'INVALID_CREDENTIALS_MODE', '原生客户端应使用独立会话');
  if (channel === 'web' && writes && !request.headers.origin) throw failure(403, 'ORIGIN_REQUIRED', '浏览器写请求需要来源校验');
  const token = channel === 'native' ? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : '') : cookies[0]?.slice('recorder_session='.length) ?? '';
  const principal = required ? auth.authenticate(token, channel) : undefined;
  if (principal && channel === 'web' && writes && request.headers['x-csrf-token'] !== auth.csrf(token)) throw failure(403, 'CSRF_REJECTED', '会话校验失败，请刷新后重试');
  return { token, channel, principal };
}
