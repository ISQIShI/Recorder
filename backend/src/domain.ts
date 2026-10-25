import type { Context } from '@deepseek-ai/cordis';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ApiMethod, Credentials, Identity, RecordData, RecordInput, RecordUpdateInput, SessionData } from '@recorder/contracts';
export type Channel = 'web' | 'native';
export interface User { id: string; username: string; passwordHash: string; createdAt: number }
export interface Principal extends Identity { channel: Channel }
export interface IdentityStore {
  instanceId: string; initialized(): boolean; user(username: string): User | undefined;
  createOwner(user: User): void; createSession(session: { id: string; userId: string; tokenHash: string; channel: Channel; clientName: string; createdAt: number; expiresAt: number }): void;
  resolve(tokenHash: string, channel: Channel, now: number): Principal | undefined;
  list(userId: string, current: string, now: number): SessionData[]; revoke(userId: string, sessionId: string, now: number): void;
}
export interface CryptoProvider { id(): string; token(): string; digest(value: string): string; hash(password: string): Promise<string>; verify(password: string, hash: string): Promise<boolean> }
export interface AuthService {
  info(): { initialized: boolean; instanceId: string };
  login(input: Credentials, channel: Channel): Promise<{ identity: Principal; token: string }>;
  setup(input: Credentials & { setupCode: string }, channel: Channel): Promise<{ identity: Principal; token: string }>;
  authenticate(token: string, channel: Channel): Principal; csrf(token: string): string;
  sessions(principal: Principal): SessionData[]; revoke(principal: Principal, sessionId: string): void;
}
export interface RecordStore {
  update(ownerId: string, input: RecordUpdateInput, now: number): RecordData;
  instanceId: string; create(ownerId: string, input: RecordInput, hash: string, id: string, now: number): RecordData;
  list(ownerId: string, q: string, limit: number, offset: number): { items: RecordData[]; total: number };
  get(ownerId: string, id: string): RecordData | undefined;
}
export interface RecordService {
  update(principal: Principal, input: RecordUpdateInput): RecordData;
  create(principal: Principal, input: RecordInput): RecordData;
  list(principal: Principal, input: { q?: string; limit?: number; offset?: number }): { items: RecordData[]; total: number };
  get(principal: Principal, id: string): RecordData;
}
export interface OperationCall { input: any; principal?: Principal; channel: Channel }
export interface OperationResult { body: unknown; token?: string; remember?: boolean; clearSession?: boolean }
export interface ApiOperations {
  register(owner: Context, method: ApiMethod, handler: (call: OperationCall) => OperationResult | Promise<OperationResult>): void;
  call(method: ApiMethod, call: OperationCall): Promise<OperationResult>;
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    recorderDatabase: { raw: Database.Database; db: BetterSQLite3Database };
    recorderMigrations: { ready: true };
    recorderCrypto: CryptoProvider;
    recorderIdentityStore: IdentityStore;
    recorderAuth: AuthService;
    recorderRecordStore: RecordStore;
    recorderRecords: RecordService;
    recorderApiOperations: ApiOperations;
  }
}
export function failure(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(message), { statusCode, code });
}
