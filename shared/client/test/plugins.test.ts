import assert from 'node:assert/strict';
import test from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import { PanelRegistry, statusPanel, bridgeTransport } from '../dist/index.js';

test('UI contribution waits for transport, withdraws with its dependency and resumes with replacement', async () => {
  const ctx = new Context();
  try {
    await ctx.plugin(PanelRegistry);
    const consumer = await ctx.plugin(statusPanel);
    assert.equal(ctx.recorderPanels.items.length, 0);
    const makeBridge = (provider: string) => ({ status: async () => ({ application: 'Recorder' as const, stage: 'foundation' as const, storage: { provider, value: 0 } }) });
    const first = await ctx.plugin(bridgeTransport, { bridge: makeBridge('first') });
    await consumer.await();
    assert.deepEqual(ctx.recorderPanels.items.map(panel => panel.id), ['backend-status']);
    assert.equal((await ctx.recorderTransport.status()).storage.provider, 'first');
    await first.dispose();
    await consumer.await();
    assert.equal(ctx.recorderPanels.items.length, 0);
    const next = await ctx.plugin(bridgeTransport, { bridge: makeBridge('replacement') });
    await consumer.await();
    assert.equal((await ctx.recorderTransport.status()).storage.provider, 'replacement');
    assert.equal(ctx.recorderPanels.items.length, 1);
    await next.dispose();
    await consumer.await();
    assert.equal(ctx.recorderPanels.items.length, 0);
  } finally { await ctx.fiber.dispose(); }
});

test('invalid transport response is rejected at the shared client boundary', async () => {
  const ctx = new Context();
  try {
    await ctx.plugin(bridgeTransport, { bridge: { status: async () => ({ application: 'other' } as never) } });
    await assert.rejects(ctx.recorderTransport.status(), /Invalid diagnostic response/);
  } finally { await ctx.fiber.dispose(); }
});
