import { Service, type Context } from '@deepseek-ai/cordis';
import type { Operations } from '../contracts.js';

export class OperationRegistry extends Service implements Operations {
  private readonly handlers = new Map<string, () => unknown>();
  constructor(ctx: Context) { super(ctx, 'recorderOperations'); }
  register(owner: Context, key: string, handler: () => unknown) {
    owner.effect(() => {
      if (this.handlers.has(key)) throw new Error('Duplicate operation: ' + key);
      this.handlers.set(key, handler);
      return () => { if (this.handlers.get(key) === handler) this.handlers.delete(key); };
    });
  }
  call(key: string) {
    const handler = this.handlers.get(key);
    if (!handler) throw Object.assign(new Error('Operation unavailable'), { statusCode: 404 });
    return handler();
  }
  keys() { return [...this.handlers.keys()].sort(); }
}
export default OperationRegistry;
