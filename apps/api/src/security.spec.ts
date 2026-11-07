import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AiMonitorService } from './admin/ai-monitor';
import { BillingController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { UsageService } from './billing/usage.service';
import { NotificationsService } from './notifications/notifications.service';
import { StripeGateway } from './billing/stripe.gateway';
import { HealthController } from './health/health.controller';
import { InterviewsController } from './interviews/interviews.controller';
import { InterviewsService } from './interviews/interviews.service';
import { PrismaService } from './prisma/prisma.service';

const SECRET = 'x'.repeat(32); const SID = '11111111-1111-4111-8111-111111111111';
const tok = (sub: string, o: object = {}) => jwt.sign({ sub, email: `${sub}@t.co`, ...o }, SECRET);
const ROLES: Record<string, string[]> = { user1: ['USER'], user2: ['USER'], admin1: ['ADMIN'], super1: ['SUPER_ADMIN'] };
const suspended = new Set<string>();
const prismaMock: any = { user: { upsert: jest.fn(async ({ where }: any) => ({ id: where.id, email: `${where.id}@t.co`, suspended: suspended.has(where.id), roles: (ROLES[where.id] ?? ['USER']).map((n) => ({ role: { name: n } })) })) },
  interviewSession: { findFirst: jest.fn(async ({ where }: any) => (where.userId === 'user1' ? { id: where.id, userId: 'user1', title: 'mine', status: 'CREATED', activeMs: 0 } : null)) },
  stripeEvent: { create: jest.fn(async () => ({})), delete: jest.fn() } };
beforeAll(() => Object.assign(process.env, { DATABASE_URL: 'x', JWT_SECRET: SECRET, FRONTEND_URL: 'http://f.co', BACKEND_URL: 'http://b.co', REDIS_URL: 'r' }));
const boot = async (opts: { controllers: any[]; providers?: any[]; imports?: any[]; raw?: boolean }) => {
  const m = await Test.createTestingModule({ imports: opts.imports ?? [], controllers: opts.controllers, providers: [{ provide: PrismaService, useValue: prismaMock }, ...(opts.providers ?? [])] }).compile();
  const app = m.createNestApplication(opts.raw ? { rawBody: true } : undefined); await app.init(); return app;
};

describe('admin RBAC over HTTP', () => {
  let app: INestApplication; const svc = { overview: jest.fn(async () => ({ users: 1 })), updatePlan: jest.fn(async () => ({ ok: true })), setSuspended: jest.fn(async () => ({ ok: true })) };
  beforeAll(async () => { app = await boot({ controllers: [AdminController], providers: [{ provide: AdminService, useValue: svc }, { provide: AiMonitorService, useValue: {} }] }); });
  afterAll(() => app.close()); afterEach(() => suspended.clear());
  const get = (path: string, t?: string) => { const r = request(app.getHttpServer()).get(path); return t ? r.set('Authorization', `Bearer ${t}`) : r; };
  it('401 without a token, with garbage, with the wrong secret, and with an unsigned (alg=none) token', async () => {
    await get('/admin/overview').expect(401); await get('/admin/overview', 'garbage').expect(401);
    await get('/admin/overview', jwt.sign({ sub: 'admin1', email: 'a@t.co' }, 'y'.repeat(32))).expect(401);
    await get('/admin/overview', jwt.sign({ sub: 'admin1', email: 'a@t.co' }, '', { algorithm: 'none' })).expect(401);
  });
  it('403 for ordinary users, 200 for admins and super admins', async () => { await get('/admin/overview', tok('user1')).expect(403); await get('/admin/overview', tok('admin1')).expect(200); await get('/admin/overview', tok('super1')).expect(200); });
  it('403 for a suspended admin', async () => { suspended.add('admin1'); await get('/admin/overview', tok('admin1')).expect(403); });
  it('Super-Admin-only routes reject plain admins and never reach the service', async () => {
    const body = { name: 'X' }; await request(app.getHttpServer()).put('/admin/plans/pro').set('Authorization', `Bearer ${tok('admin1')}`).send(body).expect(403); expect(svc.updatePlan).not.toHaveBeenCalled();
    await request(app.getHttpServer()).put('/admin/plans/pro').set('Authorization', `Bearer ${tok('super1')}`).send(body).expect(200); expect(svc.updatePlan).toHaveBeenCalled();
  });
  it('validates input: bad plan code and bad uuid are 400', async () => {
    await request(app.getHttpServer()).put('/admin/plans/enterprise').set('Authorization', `Bearer ${tok('super1')}`).send({}).expect(400); await get('/admin/users/not-a-uuid', tok('admin1')).expect(400);
    await request(app.getHttpServer()).post(`/admin/users/${SID}/suspend`).set('Authorization', `Bearer ${tok('admin1')}`).send({}).expect(400); // reason required
  });
});

describe('cross-user data access (IDOR)', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await boot({ controllers: [InterviewsController], providers: [InterviewsService] }); }); afterAll(() => app.close());
  it("owner reads their session; another user gets 404, not 403/200, and the query is scoped by userId", async () => {
    await request(app.getHttpServer()).get(`/interviews/${SID}`).set('Authorization', `Bearer ${tok('user1')}`).expect(200);
    await request(app.getHttpServer()).get(`/interviews/${SID}`).set('Authorization', `Bearer ${tok('user2')}`).expect(404);
    expect(prismaMock.interviewSession.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: SID, userId: 'user2' } }));
  });
  it("another user cannot start, end or delete someone else's session", async () => {
    for (const [m, p] of [['post', 'start'], ['post', 'end']] as const) await (request(app.getHttpServer()) as any)[m](`/interviews/${SID}/${p}`).set('Authorization', `Bearer ${tok('user2')}`).expect(404);
  });
});

describe('Stripe webhook endpoint', () => {
  let app: INestApplication; const gw = { constructEvent: jest.fn((raw: Buffer, sig: string) => { if (sig !== 'good') throw new Error('bad'); return { id: 'evt_1', type: 'noop', data: { object: {} } }; }) };
  beforeAll(async () => { app = await boot({ controllers: [BillingController], providers: [BillingService, { provide: StripeGateway, useValue: gw }, { provide: NotificationsService, useValue: { notify: jest.fn() } }, { provide: UsageService, useValue: {} }], raw: true }); }); afterAll(() => app.close());
  it('rejects missing and invalid signatures with 400', async () => { await request(app.getHttpServer()).post('/billing/webhook').send({ a: 1 }).expect(400); await request(app.getHttpServer()).post('/billing/webhook').set('stripe-signature', 'bad').send({ a: 1 }).expect(400); });
  it('accepts a valid signature without a user token and verifies the RAW body bytes', async () => {
    await request(app.getHttpServer()).post('/billing/webhook').set('stripe-signature', 'good').set('Content-Type', 'application/json').send('{"a":1}').expect(201);
    const [raw] = gw.constructEvent.mock.calls.slice(-1)[0] as [Buffer]; expect(Buffer.isBuffer(raw)).toBe(true); expect(raw.toString()).toBe('{"a":1}');
  });
  it('plan listing is public but checkout requires auth', async () => { await request(app.getHttpServer()).post('/billing/checkout').send({ plan: 'pro', interval: 'monthly' }).expect(401); });
});

describe('rate limiting', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await boot({ controllers: [HealthController], imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }])], providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }] }); }); afterAll(() => app.close());
  it('returns 429 once the limit is exceeded', async () => { const codes: number[] = []; for (let i = 0; i < 5; i++) codes.push((await request(app.getHttpServer()).get('/health')).status); expect(codes).toEqual([200, 200, 200, 429, 429]); });
});
