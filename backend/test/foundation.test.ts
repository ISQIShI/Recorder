import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Context } from '@deepseek-ai/cordis';
import { createBackend } from '../dist/bootstrap.js';

test('real Loader mounts HTTP, operations and SQLite independently; dependency removal withdraws the API', async () => {
  const ctx = await createBackend({ http: { listen: false } });
  try {
    const request = () => ctx.recorderHttp.server.inject({ method: 'POST', url: '/api/v1/plugins/foundation/operations/status', payload: {} });
    let response = await request();
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().storage.provider, 'sqlite');
    assert.deepEqual(ctx.recorderOperations.keys(), ['foundation/status']);
    await ctx.loader.update('storage', { disabled: true });
    await ctx.loader.await();
    assert.equal(ctx.get('recorderStorage'), undefined);
    assert.equal((await request()).statusCode, 404);
    assert.deepEqual(ctx.recorderOperations.keys(), []);
    for (let round = 0; round < 3; round++) {
      await ctx.loader.update('storage', { disabled: false });
      await ctx.loader.await();
      assert.equal((await request()).statusCode, 200);
      assert.deepEqual(ctx.recorderOperations.keys(), ['foundation/status']);
      await ctx.loader.update('storage', { disabled: true });
      await ctx.loader.await();
    }
  } finally { await ctx.fiber.dispose(); }
  assert.equal(ctx.get('recorderHttp'), undefined);
});

test('a different provider serves unchanged consumers; unloading SQLite retains persistent data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recorder-storage-'));
  const filename = join(directory, 'probe.sqlite');
  const ctx = await createBackend({ filename, http: { listen: false } });
  try {
    ctx.recorderStorage.write(42);
    await ctx.loader.update('storage', { disabled: true });
    await ctx.loader.await();
    ctx.loader.builtins['alternate-storage'] = {
      apply(owner: Context) {
        let value = 7;
        owner.provide('recorderStorage', { provider: 'alternate', read: () => value, write: (next: number) => { value = next; } });
      },
    };
    const replacement = await ctx.loader.create({ name: 'cordis:alternate-storage' });
    await ctx.loader.await();
    assert.deepEqual(ctx.recorderOperations.call('foundation/status'), {
      application: 'Recorder', stage: 'foundation', storage: { provider: 'alternate', value: 7 },
    });
    await ctx.loader.update(replacement, { disabled: true });
    await ctx.loader.update('storage', { disabled: false });
    await ctx.loader.await();
    assert.equal(ctx.recorderStorage.read(), 42);
  } finally {
    await ctx.fiber.dispose();
    await unlink(filename);
    await rmdir(directory);
  }
});

test('Fastify remains replaceable and rejects unknown operations and unexpected input', async () => {
  const ctx = await createBackend({ http: { listen: false } });
  try {
    const previous = ctx.recorderHttp.server;
    assert.equal((await previous.inject({ method: 'POST', url: '/api/v1/plugins/missing/operations/missing', payload: {} })).statusCode, 404);
    assert.equal((await previous.inject({ method: 'POST', url: '/api/v1/plugins/foundation/operations/status', payload: [] })).statusCode, 400);
    await ctx.loader.update('http', { disabled: true });
    await ctx.loader.await();
    assert.equal(ctx.get('recorderHttp'), undefined);
    assert.deepEqual(ctx.recorderOperations.keys(), ['foundation/status']);
    await ctx.loader.update('http', { disabled: false });
    await ctx.loader.await();
    assert.notEqual(ctx.recorderHttp.server, previous);
    assert.equal((await ctx.recorderHttp.server.inject('/openapi.json')).json().openapi, '3.1.0');
  } finally { await ctx.fiber.dispose(); }
});

test('Loader import or activation failure rejects startup instead of reporting success', async () => {
  await assert.rejects(createBackend({ entries: [{ id: 'missing', name: './not-a-plugin.js' }] }), /Plugin import failed/);
  const directory = await mkdtemp(join(tmpdir(), 'recorder-invalid-'));
  try {
    await assert.rejects(createBackend({ filename: join(directory, 'missing', 'probe.sqlite'), http: { listen: false } }));
  } finally { await rmdir(directory); }
});

test('SQLite DDL, data and a sample migration ledger roll back together on failure', () => {
  // Isolated compatibility probe, not the production migration coordinator.
  const db = new Database(':memory:');
  const sql = readFileSync(new URL('../validation/migrations/0000_validation.sql', import.meta.url), 'utf8');
  try {
    db.exec('CREATE TABLE ledger(namespace TEXT, revision INTEGER, PRIMARY KEY(namespace, revision))');
    const failed = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO ledger VALUES (?, ?)').run('example', 1);
      db.exec('INSERT INTO validation_probe VALUES (1, NULL)');
    });
    assert.throws(failed);
    assert.equal(db.prepare<[], { n: number }>('SELECT count(*) AS n FROM ledger').get()!.n, 0);
    assert.equal(db.prepare<[], { n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE name='validation_probe'").get()!.n, 0);
    db.transaction(() => {
      db.exec(sql);
      db.exec('INSERT INTO validation_probe VALUES (1, 3)');
      db.prepare('INSERT INTO ledger VALUES (?, ?)').run('example', 1);
    })();
    assert.equal(db.prepare<[], { value: number }>('SELECT value FROM validation_probe').get()!.value, 3);
  } finally { db.close(); }
});
