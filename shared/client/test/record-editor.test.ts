import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Context } from '@deepseek-ai/cordis';
import { reactive } from 'vue';
import { ApiError, type ApiTransport, type Identity, type RecordData } from '@recorder/contracts';
import * as leave from '../dist/plugins/leave-guard.js';
import * as editorPlugin from '../dist/plugins/record-editor.js';
import * as accountPlugin from '../dist/plugins/account.js';

const identity: Identity = { userId: 'owner', sessionId: 'session-1', username: 'owner', expiresAt: 9999999999999 };
const initial: RecordData = { id: 'record-1', requestId: 'create-1', title: 'before', body: 'plain source', format: 'plain', revision: 1, formatVersion: 1, originInstanceId: 'instance', createdAt: 1, updatedAt: 1 };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class LeaveTarget extends EventTarget {
  answer = false; confirmations = 0; listeners = new Set<EventListenerOrEventListenerObject>();
  confirm() { this.confirmations++; return this.answer; }
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) { if (type === 'beforeunload' && listener) this.listeners.add(listener); super.addEventListener(type, listener); }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) { if (type === 'beforeunload' && listener) this.listeners.delete(listener); super.removeEventListener(type, listener); }
}
async function fixture() {
  const ctx = new Context(), target = new LeaveTarget();
  let stored = { ...initial }, update: ((input: any) => Promise<RecordData>) | undefined;
  const updates: any[] = [];
  const state = reactive({ ready: true, error: '', identity: { ...identity } as Identity | undefined });
  await ctx.plugin((owner: Context) => {
    owner.provide('recorderAccount', { state, error: (error: unknown) => { if (error instanceof ApiError && error.status === 401) state.identity = undefined; return (error as Error).message; } } as any);
    owner.provide('recorderApi', { async request(method: string, input: any) {
      if (method === 'getRecord') return { ...stored, id: input.id };
      if (method === 'updateRecord') {
        updates.push({ ...input });
        if (update) return update(input);
        if (input.expectedRevision !== stored.revision) throw new ApiError('REVISION_CONFLICT', 'stale', 409);
        stored = { ...stored, title: input.title, body: input.body, format: input.format, revision: stored.revision + 1, updatedAt: stored.updatedAt + 1 };
        return stored;
      }
      throw new Error('unexpected ' + method);
    } } as ApiTransport);
  });
  const guard = await ctx.plugin(leave, { target });
  const editor = await ctx.plugin(editorPlugin);
  await ctx.recorderEditor.select(initial.id); await ctx.recorderEditor.begin();
  return { ctx, target, state, updates, guard, editor, setStored(value: RecordData) { stored = value; }, setUpdate(value?: typeof update) { update = value; } };
}

test('editor saves manually with frozen input, no duplicate requests, and a fresh read on edit entry', async () => {
  const f = await fixture(), e = f.ctx.recorderEditor;
  try {
    await e.save(); assert.equal(f.updates.length, 0);
    e.change({ title: 'edited', body: '# markdown <script>source</script>', format: 'markdown' });
    assert.equal(e.dirty, true); assert.equal(f.target.listeners.size, 1);
    const response = deferred<RecordData>(); f.setUpdate(() => response.promise);
    const saving = e.save();
    assert.equal(e.state.busy, true);
    e.change({ body: 'must not overwrite frozen request' });
    await e.save();
    assert.equal(f.updates.length, 1);
    assert.equal(f.updates[0].expectedRevision, 1);
    assert.equal(e.state.draft.body, '# markdown <script>source</script>');
    response.resolve({ ...initial, ...e.state.draft, revision: 2, updatedAt: 2 });
    assert.equal((await saving)?.revision, 2);
    assert.equal(e.dirty, false); assert.equal(f.target.listeners.size, 0);
    assert.equal(e.state.message, '已保存到后端');
    e.cancel(); assert.equal(f.target.confirmations, 0);
    f.setStored({ ...initial, revision: 8, body: 'changed while viewing' });
    await e.begin();
    assert.equal(e.state.baseline?.revision, 8);
    assert.equal(e.state.draft.body, 'changed while viewing');
  } finally { await f.ctx.fiber.dispose(); }
});

test('conflict/latest/discard/rebase keep the draft and original revision until explicit choice', async () => {
  const f = await fixture(), e = f.ctx.recorderEditor;
  try {
    e.change({ body: 'my draft' });
    f.setStored({ ...initial, body: 'other device', revision: 2 });
    await e.save();
    assert.equal(e.state.conflict, true); assert.equal(e.state.draft.body, 'my draft');
    await e.viewLatest();
    assert.equal(e.state.latest?.body, 'other device'); assert.equal(e.state.baseline?.revision, 1);
    e.hideLatest(); assert.equal(e.state.draft.body, 'my draft');
    await e.save(); assert.equal(f.updates[1].expectedRevision, 1);
    await e.viewLatest(); e.rebase();
    assert.equal(e.state.baseline?.revision, 2); assert.equal(e.state.draft.body, 'my draft');
    f.setStored({ ...initial, revision: 3, body: 'changed again' });
    await e.save(); assert.equal(e.state.conflict, true); assert.equal(f.updates[2].expectedRevision, 2);
    await e.discard(); assert.equal(e.state.draft.body, 'my draft', 'canceled discard leaves draft intact');
    f.target.answer = true; await e.discard();
    assert.equal(e.state.draft.body, 'changed again'); assert.equal(e.state.baseline?.revision, 3);
    assert.equal(e.dirty, false);
  } finally { await f.ctx.fiber.dispose(); }
});

test('service errors, uncertain timeouts and leave cancellation preserve in-memory edits', async () => {
  const f = await fixture(), e = f.ctx.recorderEditor;
  try {
    e.change({ body: 'unsaved' });
    f.setUpdate(async () => { throw new ApiError('PLUGIN_UNAVAILABLE', 'service unavailable', 503); });
    await e.save(); assert.equal(e.state.draft.body, 'unsaved'); assert.equal(e.state.message, 'service unavailable');
    f.setUpdate(async () => { throw new DOMException('timeout', 'TimeoutError'); });
    await e.save(); assert.match(e.state.message, /结果尚未确认/); assert.equal(e.state.baseline?.revision, 1);
    const event = new Event('beforeunload', { cancelable: true }); f.target.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
    e.cancel(); assert.equal(e.state.editing, true);
    await e.select('record-2'); assert.equal(e.state.record?.id, initial.id);
    f.target.answer = true; await e.select('record-2');
    assert.equal(e.state.record?.id, 'record-2'); assert.equal(e.state.editing, false);
    assert.equal(f.target.listeners.size, 0);
  } finally { await f.ctx.fiber.dispose(); }
});

test('session changes and 401 clear old drafts synchronously and ignore delayed responses', async () => {
  const f = await fixture(), e = f.ctx.recorderEditor;
  try {
    e.change({ body: 'private first identity draft' });
    const response = deferred<RecordData>(); f.setUpdate(() => response.promise);
    const saving = e.save();
    f.state.identity = { ...identity, sessionId: 'new-session', userId: 'other' };
    assert.equal(e.state.record, undefined); assert.equal(e.state.draft.body, ''); assert.equal(e.state.busy, false);
    response.resolve({ ...initial, body: 'old server response', revision: 2 }); await saving;
    assert.equal(e.state.record, undefined); assert.equal(e.state.draft.body, '');
    await e.select(initial.id); await e.begin(); e.change({ body: 'new draft' });
    f.setUpdate(async () => { throw new ApiError('UNAUTHENTICATED', 'revoked', 401); });
    await e.save();
    assert.equal(f.state.identity, undefined); assert.equal(e.state.draft.body, ''); assert.equal(f.target.listeners.size, 0);
  } finally { await f.ctx.fiber.dispose(); }
});

test('Cordis withdrawal removes the guard listener and draft service, restoration registers once', async () => {
  const f = await fixture();
  try {
    f.ctx.recorderEditor.change({ body: 'dirty' }); assert.equal(f.target.listeners.size, 1);
    await f.guard.dispose(); await f.editor.await();
    assert.equal(f.target.listeners.size, 0); assert.equal(f.ctx.get('recorderEditor'), undefined);
    const next = await f.ctx.plugin(leave, { target: f.target }); await f.editor.await();
    await f.ctx.recorderEditor.select(initial.id); await f.ctx.recorderEditor.begin(); f.ctx.recorderEditor.change({ body: 'again' });
    assert.equal(f.target.listeners.size, 1);
    await next.dispose(); await f.editor.await(); assert.equal(f.target.listeners.size, 0);
  } finally { await f.ctx.fiber.dispose(); }
});

test('account logout honors the shared dirty guard and forced authentication cleanup remains possible', async () => {
  const ctx = new Context(), target = new LeaveTarget(); let logoutCalls = 0;
  try {
    await ctx.plugin((owner: Context) => owner.provide('recorderApi', { request: async (method: string) => {
      if (method === 'info') return { initialized: true, instanceId: 'instance' };
      if (method === 'me') return identity;
      if (method === 'logout') { logoutCalls++; return { ok: true }; }
      throw new Error('unexpected');
    } } as ApiTransport));
    await ctx.plugin(leave, { target }); await ctx.plugin(accountPlugin); await ctx.recorderAccount.refresh();
    ctx.recorderLeave.register(ctx, () => true);
    assert.equal(await ctx.recorderAccount.logout(), false); assert.equal(logoutCalls, 0); assert.ok(ctx.recorderAccount.state.identity);
    target.answer = true;
    assert.equal(await ctx.recorderAccount.logout(), true); assert.equal(logoutCalls, 1); assert.equal(ctx.recorderAccount.state.identity, undefined);
  } finally { await ctx.fiber.dispose(); }
});

test('a missing Web session completes account initialization instead of leaving the login screen pending', async () => {
  const ctx = new Context(), target = new LeaveTarget();
  try {
    await ctx.plugin((owner: Context) => owner.provide('recorderApi', { request: async (method: string) => {
      if (method === 'info') return { initialized: true, instanceId: 'instance' };
      throw new ApiError('UNAUTHENTICATED', 'no session', 401);
    } } as ApiTransport));
    await ctx.plugin(leave, { target }); await ctx.plugin(accountPlugin); await ctx.recorderAccount.refresh();
    assert.equal(ctx.recorderAccount.state.ready, true);
    assert.equal(ctx.recorderAccount.state.identity, undefined);
    assert.equal(ctx.recorderAccount.state.error, '');
  } finally { await ctx.fiber.dispose(); }
});

test('desktop exit plugin withdraws all listeners, restores once, and waits for accepted close before disposal', async () => {
  const bundled = await build({ stdin: { contents: `export * from ${JSON.stringify(fileURLToPath(new URL('../../../desktop/src/plugins/exit.ts', import.meta.url)))}; export { app, dialog } from 'electron';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'exit-test-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `import { EventEmitter } from 'node:events'; export const app = new EventEmitter(); app.quits = 0; app.quit = () => { app.quits++; app.emit('before-quit', { preventDefault() {} }); }; export const dialog = { choice: 0, showMessageBoxSync() { return this.choice; } };` }));
    } }] });
  const exit = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0]!.text).toString('base64'));
  const ctx = new Context(), contents = new EventEmitter(), window = new EventEmitter();
  let closes = 0, disposals = 0;
  Object.assign(window, { webContents: contents, isDestroyed: () => false, close: () => { closes++; } });
  const disposed = deferred<void>();
  const config = { dispose: () => { disposals++; return disposed.promise; } };
  const assertListeners = (count: number) => {
    assert.equal(exit.app.listenerCount('before-quit'), count);
    assert.equal(exit.app.listenerCount('window-all-closed'), count);
    assert.equal(window.listenerCount('closed'), count);
    assert.equal(contents.listenerCount('will-prevent-unload'), count);
  };
  try {
    await ctx.plugin((owner: Context) => owner.provide('recorderWindow', window as any));
    const first = await ctx.plugin(exit, config); assertListeners(1);
    await first.dispose(); assertListeners(0); assert.equal(ctx.get('recorderExit'), undefined);
    await ctx.plugin(exit, config); assertListeners(1);
    (ctx.get('recorderExit') as { request(): void }).request(); assert.equal(closes, 1); assert.equal(disposals, 0);
    let allowed = false;
    contents.emit('will-prevent-unload', { preventDefault() { allowed = true; } });
    assert.equal(allowed, false); assert.equal(disposals, 0);
    exit.dialog.choice = 1;
    contents.emit('will-prevent-unload', { preventDefault() { allowed = true; } });
    assert.equal(allowed, true); assert.equal(disposals, 0);
    window.emit('closed'); exit.app.emit('window-all-closed');
    assert.equal(disposals, 1); assert.equal(exit.app.quits, 1);
    await ctx.fiber.dispose(); assertListeners(0);
    disposed.resolve(); await disposed.promise; await Promise.resolve();
    assert.equal(exit.app.quits, 2);
  } finally { disposed.resolve(); await ctx.fiber.dispose(); }
});
