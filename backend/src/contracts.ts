import type { Context } from '@deepseek-ai/cordis';
import type { FastifyInstance } from 'fastify';

export interface ValidationStorage {
  readonly provider: string;
  read(): number;
  write(value: number): void;
}
export interface Operations {
  register(owner: Context, key: string, handler: () => unknown): void;
  call(key: string): unknown;
  keys(): string[];
}
export interface HttpService { server: FastifyInstance; address: string }
declare module '@deepseek-ai/cordis' {
  interface Context {
    recorderStorage: ValidationStorage;
    recorderOperations: Operations;
    recorderHttp: HttpService;
  }
}
