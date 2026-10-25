export type BodyFormat = 'plain' | 'markdown';
export interface Credentials { username: string; password: string; remember: boolean; clientName: string }
export interface RecordInput { requestId: string; title: string; body: string; format: BodyFormat }
export interface RecordData extends RecordInput {
  id: string; revision: number; formatVersion: number; createdAt: number; updatedAt: number; originInstanceId: string;
}
export interface Identity { userId: string; username: string; sessionId: string; expiresAt: number }
export interface SessionData { id: string; clientName: string; createdAt: number; expiresAt: number; current: boolean }
export interface ApiInputs {
  info: {}; setup: Credentials & { setupCode: string }; login: Credentials; me: {}; logout: {};
  sessions: {}; revoke: { sessionId: string }; createRecord: RecordInput;
  listRecords: { q?: string; limit?: number; offset?: number }; getRecord: { id: string };
}
export interface ApiOutputs {
  info: { initialized: boolean; instanceId: string };
  setup: Identity; login: Identity; me: Identity; logout: { ok: true }; revoke: { ok: true };
  sessions: { items: SessionData[] }; createRecord: RecordData; getRecord: RecordData;
  listRecords: { items: RecordData[]; total: number };
}
export type ApiMethod = keyof ApiInputs;
export interface ApiTransport { request<K extends ApiMethod>(method: K, input: ApiInputs[K]): Promise<ApiOutputs[K]> }
const string = (maxLength: number, minLength = 0) => ({ type: 'string', maxLength, minLength });
const object = (properties: object, required: string[] = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const credentialFields = { username: { ...string(64, 3), pattern: '^[A-Za-z0-9_.-]+$' }, password: string(128, 12), remember: { type: 'boolean' }, clientName: string(80, 1) };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' };
export const apiRoutes = {
  info: { method: 'GET', path: '/api/v1/info', authenticated: false, input: object({}) },
  setup: { method: 'POST', path: '/api/v1/auth/setup', authenticated: false, input: object({ ...credentialFields, setupCode: string(128, 20) }) },
  login: { method: 'POST', path: '/api/v1/auth/login', authenticated: false, input: object(credentialFields) },
  me: { method: 'GET', path: '/api/v1/me', authenticated: true, input: object({}) },
  logout: { method: 'POST', path: '/api/v1/auth/logout', authenticated: true, input: object({}) },
  sessions: { method: 'GET', path: '/api/v1/auth/sessions', authenticated: true, input: object({}) },
  revoke: { method: 'POST', path: '/api/v1/auth/sessions/revoke', authenticated: true, input: object({ sessionId: uuid }) },
  createRecord: { method: 'POST', path: '/api/v1/records', authenticated: true, input: object({ requestId: uuid, title: string(200), body: string(200000, 1), format: { enum: ['plain', 'markdown'], type: 'string' } }) },
  listRecords: { method: 'GET', path: '/api/v1/records', authenticated: true, input: object({ q: string(200), limit: { type: 'integer', minimum: 1, maximum: 100 }, offset: { type: 'integer', minimum: 0, maximum: 1000000 } }, []) },
  getRecord: { method: 'GET', path: '/api/v1/records/:id', authenticated: true, input: object({ id: uuid }) },
} as const;
const identitySchema = object({ userId: uuid, username: string(64), sessionId: uuid, expiresAt: { type: 'integer' } });
const recordSchema = object({ id: uuid, requestId: uuid, title: string(200), body: string(200000), format: { type: 'string', enum: ['plain', 'markdown'] }, formatVersion: { type: 'integer', const: 1 }, revision: { type: 'integer' }, createdAt: { type: 'integer' }, updatedAt: { type: 'integer' }, originInstanceId: uuid });
export const apiResponses: Record<ApiMethod, object> = {
  info: object({ initialized: { type: 'boolean' }, instanceId: uuid }), setup: identitySchema, login: identitySchema, me: identitySchema,
  logout: object({ ok: { type: 'boolean', const: true } }), revoke: object({ ok: { type: 'boolean', const: true } }),
  sessions: object({ items: { type: 'array', items: object({ id: uuid, clientName: string(80), createdAt: { type: 'integer' }, expiresAt: { type: 'integer' }, current: { type: 'boolean' } }) } }),
  createRecord: recordSchema, getRecord: recordSchema, listRecords: object({ items: { type: 'array', items: recordSchema }, total: { type: 'integer' } }),
};
export function isApiMethod(value: unknown): value is ApiMethod { return typeof value === 'string' && Object.hasOwn(apiRoutes, value); }
export class ApiError extends Error { constructor(public readonly code: string, message: string, public readonly status: number) { super(message); } }
function isRecord(value: any): value is RecordData {
  return value && typeof value.id === 'string' && typeof value.title === 'string' && typeof value.body === 'string'
    && ['plain', 'markdown'].includes(value.format) && typeof value.requestId === 'string' && value.formatVersion === 1
    && Number.isSafeInteger(value.revision) && Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.updatedAt) && typeof value.originInstanceId === 'string';
}
export function parseApiResponse<K extends ApiMethod>(method: K, value: unknown): ApiOutputs[K] {
  const v = value as any;
  const identity = () => v && ['userId', 'username', 'sessionId'].every(k => typeof v[k] === 'string') && Number.isSafeInteger(v.expiresAt);
  const valid = method === 'info' ? v && typeof v.initialized === 'boolean' && typeof v.instanceId === 'string'
    : ['setup', 'login', 'me'].includes(method) ? identity()
    : ['logout', 'revoke'].includes(method) ? v?.ok === true
    : method === 'sessions' ? Array.isArray(v?.items) && v.items.every((s: any) => s && typeof s.id === 'string' && typeof s.clientName === 'string' && typeof s.current === 'boolean' && Number.isSafeInteger(s.createdAt) && Number.isSafeInteger(s.expiresAt))
    : method === 'listRecords' ? Array.isArray(v?.items) && v.items.every(isRecord) && Number.isSafeInteger(v.total)
    : isRecord(v);
  if (!valid) throw new ApiError('INVALID_RESPONSE', '后端响应格式不正确', 502);
  return v;
}
