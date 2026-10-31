import type { Context } from '@deepseek-ai/cordis';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ApiInputs, ApiMethod, Credentials, Identity, RecordData, RecordInput, RecordUpdateInput, RecordRevisionInput, RecordState, SessionData } from '@recorder/contracts';
import type { MigrationPlanner, MigrationExecutor } from './migration-contract.js';
import type { DatabaseOwnership, DatabaseUse, RecoveryPoints } from './storage-contract.js';
import type { MaintenanceRuns, MaintenanceCoordinator, IsolatedRecovery } from './maintenance-contract.js';
export * from './migration-contract.js';
export * from './storage-contract.js';
export * from './maintenance-contract.js';
export * from './tags-contract.js';
export * from './categories-contract.js';
export * from './attachments-contract.js';
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
  request(ownerId: string, requestId: string): { record: RecordData; hash: string } | undefined;
  setState(ownerId: string, input: RecordRevisionInput, state: RecordState, now: number): RecordData;
  emptyTrash(ownerId: string): { deleted: number };
  update(ownerId: string, input: RecordUpdateInput, now: number): RecordData;
  instanceId: string; create(ownerId: string, input: RecordInput, hash: string, id: string, now: number): RecordData;
  list(ownerId: string, q: string, limit: number, offset: number, state?: RecordState): { items: RecordData[]; total: number };
  get(ownerId: string, id: string): RecordData | undefined;
}
export interface RecordService {
  fileRecord(principal: Principal, requestId: string, name: string, create?: boolean): RecordData | undefined;
  trash(principal: Principal, input: RecordRevisionInput): RecordData;
  restore(principal: Principal, input: RecordRevisionInput): RecordData;
  emptyTrash(principal: Principal, input: ApiInputs['emptyTrash']): { deleted: number };
  update(principal: Principal, input: RecordUpdateInput): RecordData;
  create(principal: Principal, input: RecordInput): RecordData;
  list(principal: Principal, input: ApiInputs['listRecords']): { items: RecordData[]; total: number };
  get(principal: Principal, id: string): RecordData;
}
export interface OperationCall { input: any; principal?: Principal; channel: Channel }
export interface OperationResult { body: unknown; token?: string; remember?: boolean; clearSession?: boolean }
export interface ApiOperations {
  registerFile(owner: Context, method: 'uploadAttachment' | 'downloadAttachment' | 'createFileRecord', handler: (call: import('./attachments-contract.js').FileCall) => Promise<import('./attachments-contract.js').FileResult>): void;
  callFile(method: 'uploadAttachment' | 'downloadAttachment' | 'createFileRecord', call: import('./attachments-contract.js').FileCall): Promise<import('./attachments-contract.js').FileResult>;
  register(owner: Context, method: ApiMethod, handler: (call: OperationCall) => OperationResult | Promise<OperationResult>): void;
  call(method: ApiMethod, call: OperationCall): Promise<OperationResult>;
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    recorderDatabaseOwnership: DatabaseOwnership;
    recorderDatabase: { raw: Database.Database; db: BetterSQLite3Database } & DatabaseUse;
    recorderRecoveryPoints: RecoveryPoints;
    recorderMaintenanceRuns: MaintenanceRuns;
    recorderMaintenance: MaintenanceCoordinator;
    recorderIsolatedRecovery: IsolatedRecovery;
    recorderMigrations: { ready: true };
    recorderMigrationPlanner: MigrationPlanner;
    recorderMigrationExecutor: MigrationExecutor;
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
