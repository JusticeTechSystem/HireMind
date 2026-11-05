import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AllExceptionsFilter } from '../common/exception.filter';
import { AuthGuard } from '../auth/auth.guard';
import { AccountService } from './account.service';

const SECRET = 'x'.repeat(32); const UID = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { Object.assign(process.env, { DATABASE_URL: 'x', JWT_SECRET: SECRET, FRONTEND_URL: 'http://f.co', BACKEND_URL: 'http://b.co', REDIS_URL: 'r' }); delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; });

describe('AccountService', () => {
  const mk = () => {
    const order: string[] = [];
    const p: any = { subscription: { findMany: jest.fn(async () => [{ stripeSubscriptionId: 'sub_1' }]) }, resume: { findMany: jest.fn(async () => [{ storagePath: 'u/r.pdf' }]) },
      deletedAccount: { create: jest.fn(() => 'tomb') }, aiRequestLog: { deleteMany: jest.fn(() => 'logs') }, user: { delete: jest.fn(() => 'user'), findUnique: jest.fn(async () => ({ id: UID, email: 'a@b.co' })) },
      $transaction: jest.fn(async () => { order.push('db'); }) };
    for (const m of ['profile', 'interviewSession', 'mockInterview', 'notification', 'payment', 'usageRecord', 'supportTicket', 'answerFeedback']) p[m] = { findFirst: jest.fn(), findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) };
    p.subscription.findMany = jest.fn(async () => [{ stripeSubscriptionId: 'sub_1' }]);
    const storage: any = { remove: jest.fn(async () => { order.push('storage'); }) }; const stripe: any = { cancelSubscription: jest.fn(async () => { order.push('stripe'); }) }; const audit: any = { log: jest.fn(async () => { order.push('audit'); }) };
    return { p, order, storage, stripe, audit, svc: new AccountService(p, storage, stripe, audit) };
  };
  it('cancels billing and removes files BEFORE touching the database, then audits without personal data', async () => {
    const { svc, order, audit } = mk(); await svc.delete(UID); expect(order).toEqual(['stripe', 'storage', 'db', 'audit']); expect(audit.log).toHaveBeenCalledWith(null, 'account.delete', `user:${UID}`);
  });
  it('aborts with nothing deleted if the login record cannot be removed', async () => {
    Object.assign(process.env, { SUPABASE_URL: 'http://sb.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' }); (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    const { svc, p } = mk(); await expect(svc.delete(UID)).rejects.toThrow(BadGatewayException); expect(p.$transaction).not.toHaveBeenCalled();
  });
  it('treats an already-removed login record (404) as success', async () => {
    Object.assign(process.env, { SUPABASE_URL: 'http://sb.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' }); (global as any).fetch = jest.fn(async () => ({ ok: false, status: 404 }));
    const { svc, p } = mk(); await svc.delete(UID); expect(p.$transaction).toHaveBeenCalled();
  });
  it('export is scoped to the requesting user only', async () => {
    const { svc, p } = mk(); const r = await svc.export(UID); expect(r).toHaveProperty('sessions'); expect(p.interviewSession.findMany.mock.calls[0][0].where).toEqual({ userId: UID }); expect(p.resume.findMany.mock.calls[0][0].where).toEqual({ userId: UID });
  });
});

describe('deleted accounts cannot be resurrected by a still-valid token', () => {
  const ctx = (token: string) => { const req: any = { headers: { authorization: `Bearer ${token}` } }; return { req, c: { switchToHttp: () => ({ getRequest: () => req }) } as any }; };
  const tok = jwt.sign({ sub: UID, email: 'a@b.co' }, SECRET);
  const mk = (tombstone: boolean, ageMs: number) => { const prisma: any = { user: { upsert: jest.fn(async () => ({ id: UID, email: 'a@b.co', suspended: false, createdAt: new Date(Date.now() - ageMs), roles: [] })), delete: jest.fn() }, deletedAccount: { findUnique: jest.fn(async () => (tombstone ? { id: UID } : null)) } }; return { prisma, g: new AuthGuard(prisma) }; };
  it('rejects and removes the re-created row', async () => { const { g, prisma } = mk(true, 0); await expect(g.canActivate(ctx(tok).c)).rejects.toThrow(UnauthorizedException); expect(prisma.user.delete).toHaveBeenCalled(); });
  it('does not consult the tombstone for established accounts (no extra query per request)', async () => { const { g, prisma } = mk(true, 3_600_000); await expect(g.canActivate(ctx(tok).c)).resolves.toBe(true); expect(prisma.deletedAccount.findUnique).not.toHaveBeenCalled(); });
  it('lets genuinely new users in', async () => { const { g } = mk(false, 0); await expect(g.canActivate(ctx(tok).c)).resolves.toBe(true); });
});

describe('AllExceptionsFilter', () => {
  const run = (e: unknown, report = jest.fn()) => { const json = jest.fn(); const res = { status: jest.fn(() => ({ json })) }; const host: any = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ headers: { 'x-request-id': 'rid-1' }, method: 'GET', url: '/x' }) }) }; new AllExceptionsFilter(report).catch(e, host); return { res, json, report }; };
  it('hides internals of unexpected errors and reports them with the request id', () => { const { res, json, report } = run(new Error('db password is hunter2')); expect(res.status).toHaveBeenCalledWith(500); expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('hunter2'); expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 500, requestId: 'rid-1' }); expect(report).toHaveBeenCalled(); });
  it('passes 4xx through unreported', () => { const { HttpException } = require('@nestjs/common'); const { res, json, report } = run(new HttpException({ message: 'nope', code: 'X' }, 402)); expect(res.status).toHaveBeenCalledWith(402); expect(json.mock.calls[0][0]).toMatchObject({ code: 'X', requestId: 'rid-1' }); expect(report).not.toHaveBeenCalled(); });
});
