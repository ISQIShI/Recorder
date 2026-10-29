import type { ApiInputs, ApiOutputs, CategoryData } from '@recorder/contracts';
import type { Principal } from './domain.js';
export interface CategoryStore {
  list(ownerId: string): CategoryData[];
  create(ownerId: string, input: ApiInputs['createCategory'], id: string, now: number): CategoryData;
  update(ownerId: string, input: ApiInputs['updateCategory'], now: number): CategoryData;
  delete(ownerId: string, input: ApiInputs['deleteCategory']): { deleted: number };
  recordCategories(ownerId: string, id: string): CategoryData[];
  associate(ownerId: string, input: ApiInputs['addRecordCategory'], add: boolean): void;
  records(ownerId: string, input: ApiInputs['listCategoryRecords']): ApiOutputs['listCategoryRecords'];
}
export interface CategoryService {
  list(principal: Principal): ApiOutputs['listCategories'];
  create(principal: Principal, input: ApiInputs['createCategory']): CategoryData;
  update(principal: Principal, input: ApiInputs['updateCategory']): CategoryData;
  delete(principal: Principal, input: ApiInputs['deleteCategory']): { deleted: number };
  recordCategories(principal: Principal, input: ApiInputs['getRecordCategories']): ApiOutputs['getRecordCategories'];
  associate(principal: Principal, input: ApiInputs['addRecordCategory'], add: boolean): { ok: true };
  records(principal: Principal, input: ApiInputs['listCategoryRecords']): ApiOutputs['listCategoryRecords'];
}
declare module '@deepseek-ai/cordis' { interface Context { recorderCategoryStore: CategoryStore; recorderCategories: CategoryService } }
