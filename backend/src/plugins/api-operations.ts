import { Service, type Context } from '@deepseek-ai/cordis';
import type { ApiMethod } from '@recorder/contracts';
import { failure, type ApiOperations, type OperationCall, type OperationResult } from '../domain.js';
type Handler = (call: OperationCall) => OperationResult | Promise<OperationResult>;
export default class Registry extends Service implements ApiOperations {
  private files = new Map<string, (call: import('../attachments-contract.js').FileCall) => Promise<import('../attachments-contract.js').FileResult>>();
  registerFile(owner: Context, method: 'uploadAttachment' | 'downloadAttachment' | 'createFileRecord', handler: (call: import('../attachments-contract.js').FileCall) => Promise<import('../attachments-contract.js').FileResult>) {
    owner.effect(() => { if (this.files.has(method)) throw new Error('Duplicate file operation'); this.files.set(method, handler); return () => { if (this.files.get(method) === handler) this.files.delete(method); }; });
  }
  async callFile(method: 'uploadAttachment' | 'downloadAttachment' | 'createFileRecord', call: import('../attachments-contract.js').FileCall) {
    const handler = this.files.get(method); if (!handler) throw failure(503, 'PLUGIN_UNAVAILABLE', '附件传输插件暂不可用'); return handler(call);
  }
  private handlers = new Map<ApiMethod, Handler>();
  constructor(ctx: Context) { super(ctx, 'recorderApiOperations'); }
  register(owner: Context, method: ApiMethod, handler: Handler) {
    owner.effect(() => {
      if (this.handlers.has(method)) throw new Error('Duplicate API operation: ' + method);
      this.handlers.set(method, handler);
      return () => { if (this.handlers.get(method) === handler) this.handlers.delete(method); };
    });
  }
  async call(method: ApiMethod, call: OperationCall) {
    const handler = this.handlers.get(method);
    if (!handler) throw failure(503, 'PLUGIN_UNAVAILABLE', '所需插件暂不可用');
    return handler(call);
  }
}
