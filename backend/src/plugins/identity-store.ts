import type { Context } from '@deepseek-ai/cordis';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { users, sessions, instances } from '../data/identity-schema.js';
import { failure, type IdentityStore } from '../domain.js';
export const inject = ['recorderDatabase', 'recorderMigrations', 'recorderCrypto'];
export function apply(ctx: Context) {
  const { db } = ctx.recorderDatabase;
  db.insert(instances).values({ id: ctx.recorderCrypto.id(), slot: 1 }).onConflictDoNothing().run();
  const instanceId = db.select().from(instances).get()!.id;
  ctx.provide('recorderIdentityStore', {
    instanceId,
    initialized: () => Boolean(db.select({ id: users.id }).from(users).get()),
    user: username => db.select().from(users).where(eq(users.username, username)).get(),
    createOwner(user) {
      db.transaction(tx => {
        if (tx.select({ id: users.id }).from(users).get()) throw failure(409, 'ALREADY_INITIALIZED', '账号已初始化，请登录');
        tx.insert(users).values({ ...user, ownerSlot: 1 }).run();
      }, { behavior: 'immediate' });
    },
    createSession: session => { db.insert(sessions).values(session).run(); },
    resolve(tokenHash, channel, now) {
      const row = db.select({ userId: users.id, username: users.username, sessionId: sessions.id, expiresAt: sessions.expiresAt, channel: sessions.channel })
        .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, tokenHash), eq(sessions.channel, channel), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))).get();
      return row;
    },
    list(userId, current, now) {
      return db.select({ id: sessions.id, clientName: sessions.clientName, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt }).from(sessions)
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))).all().map(row => ({ ...row, current: row.id === current }));
    },
    revoke(userId, sessionId, now) { db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).run(); },
  } satisfies IdentityStore);
}
