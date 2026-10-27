import type { ApiInputs, ApiOutputs, TagData } from '@recorder/contracts';
import type { Principal } from './domain.js';
export interface TagStore {
  list(ownerId: string): TagData[];
  create(ownerId: string, name: string, id: string, now: number): TagData;
  recordTags(ownerId: string, id: string): TagData[];
  associate(ownerId: string, id: string, tagId: string, add: boolean): void;
  records(ownerId: string, tagId: string, q: string, limit: number, offset: number): ApiOutputs['listTagRecords'];
}
export interface TagService {
  list(principal: Principal): ApiOutputs['listTags'];
  create(principal: Principal, input: ApiInputs['createTag']): TagData;
  recordTags(principal: Principal, input: ApiInputs['getRecordTags']): ApiOutputs['getRecordTags'];
  associate(principal: Principal, input: ApiInputs['addRecordTag'], add: boolean): { ok: true };
  records(principal: Principal, input: ApiInputs['listTagRecords']): ApiOutputs['listTagRecords'];
}
declare module '@deepseek-ai/cordis' {
  interface Context { recorderTagStore: TagStore; recorderTags: TagService }
}
