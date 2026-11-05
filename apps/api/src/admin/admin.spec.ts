import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiMonitorService, estimateCost } from './ai-monitor';
import { assertCanModerate } from './rbac';
import { planUpdateSchema, pricingSchema } from './admin.schemas';
import { OpenAiProvider } from '../ai/ai-provider';

const user = { id: 'u', roles: ['USER'] }, admin = { id: 'a', roles: ['ADMIN'] }, admin2 = { id: 'a2', roles: ['ADMIN'] }, sup = { id: 's', roles: ['SUPER_ADMIN'] }, sup2 = { id: 's2', roles: ['SUPER_ADMIN'] };
describe('assertCanModerate', () => {
  it('admins may moderate users only', () => { expect(() => assertCanModerate(admin, user)).not.toThrow(); expect(() => assertCanModerate(admin, admin2)).toThrow(ForbiddenException); expect(() => assertCanModerate(admin, sup)).toThrow(ForbiddenException); });
  it('super admins may moderate admins and users but never super admins', () => { expect(() => assertCanModerate(sup, admin)).not.toThrow(); expect(() => assertCanModerate(sup, user)).not.toThrow(); expect(() => assertCanModerate(sup, sup2)).toThrow(ForbiddenException); });
  it('nobody moderates themselves', () => { expect(() => assertCanModerate(admin, admin)).toThrow(ForbiddenException); expect(() => assertCanModerate(sup, sup)).toThrow(ForbiddenException); });
});

describe('route protection', () => {
  const guards = (Reflect.getMetadata('__guards__', AdminController) as unknown[]).map((g: any) => g.name);
  it('AdminController is behind AuthGuard + RolesGuard with a class-level admin role', () => { expect(guards).toEqual(['AuthGuard', 'RolesGuard']); expect(Reflect.getMetadata('roles', AdminController)).toEqual(['ADMIN', 'SUPER_ADMIN']); });
  it('every handler resolves to a role requirement (none are open)', () => {
    for (const name of Object.getOwnPropertyNames(AdminController.prototype).filter((n) => n !== 'constructor')) {
      const roles = Reflect.getMetadata('roles', (AdminController.prototype as any)[name]) ?? Reflect.getMetadata('roles', AdminController); expect(roles?.length).toBeGreaterThan(0);
    }
  });
  it('role changes, plan edits and pricing are Super Admin only', () => { for (const n of ['updateRole', 'updatePlan', 'setPricing']) expect(Reflect.getMetadata('roles', (AdminController.prototype as any)[n])).toEqual(['SUPER_ADMIN']); });
});

describe('schemas', () => {
  const limits = { aiRequests: 1, transcriptionMinutes: 1, resumeAnalyses: 1, mockInterviews: 1, advancedCodingRequests: 1 };
  it('plan update requires every metric, rejects unknown keys and malformed price ids', () => {
    expect(planUpdateSchema.safeParse({ limits }).success).toBe(true); expect(planUpdateSchema.safeParse({ limits: { aiRequests: 1 } }).success).toBe(false);
    expect(planUpdateSchema.safeParse({ limits: { ...limits, aiRequests: -2 } }).success).toBe(false); expect(planUpdateSchema.safeParse({ evil: 1 }).success).toBe(false); expect(planUpdateSchema.safeParse({ stripePriceMonthly: 'prod_1' }).success).toBe(false);
  });
  it('pricing defaults to empty (no invented prices)', () => expect(pricingSchema.parse({})).toEqual({ currency: 'USD', models: {} }));
});

describe('AdminService', () => {
  const mk = (target: any = { id: 'u', roles: [{ role: { name: 'USER' } }] }) => {
    const p: any = { user: { findUnique: jest.fn(async () => target), update: jest.fn() }, role: { upsert: jest.fn(async () => ({ id: 'r' })) }, userRole: { upsert: jest.fn(), deleteMany: jest.fn() },
      plan: { findUnique: jest.fn(async () => ({ code: 'pro', limits: { aiRequests: 1 } })), update: jest.fn(async ({ data }: any) => data) }, supportTicket: { updateMany: jest.fn(async () => ({ count: 1 })), findUnique: jest.fn(async () => ({ userId: 'u9', subject: 'Help' })) } };
    const audit: any = { log: jest.fn() }; return { p, audit, svc: new AdminService(p, audit, {} as any) };
  };
  it('suspends, audits with the reason, and 404s unknown users', async () => {
    const { svc, p, audit } = mk(); await svc.setSuspended(admin, 'u', true, 'abuse'); expect(p.user.update).toHaveBeenCalledWith({ where: { id: 'u' }, data: { suspended: true } }); expect(audit.log).toHaveBeenCalledWith('a', 'user.suspend', 'user:u', { reason: 'abuse' });
    await expect(mk(null).svc.setSuspended(admin, 'x', true, 'r')).rejects.toThrow(NotFoundException);
  });
  it('blocks admins suspending admins or themselves and writes nothing', async () => {
    const { svc, p, audit } = mk({ id: 'a2', roles: [{ role: { name: 'ADMIN' } }] }); await expect(svc.setSuspended(admin, 'a2', true, 'x')).rejects.toThrow(ForbiddenException); expect(p.user.update).not.toHaveBeenCalled(); expect(audit.log).not.toHaveBeenCalled();
  });
  it('only super admins change roles, never a super admin target', async () => {
    await expect(mk().svc.setRole(admin, 'u', 'ADMIN')).rejects.toThrow(ForbiddenException);
    await expect(mk({ id: 's2', roles: [{ role: { name: 'SUPER_ADMIN' } }] }).svc.setRole(sup, 's2', 'USER')).rejects.toThrow(ForbiddenException);
    const { svc, p, audit } = mk(); await svc.setRole(sup, 'u', 'ADMIN'); expect(p.userRole.upsert).toHaveBeenCalled(); expect(audit.log).toHaveBeenCalledWith('s', 'user.role', 'user:u', { role: 'ADMIN' });
    await svc.setRole(sup, 'u', 'USER'); expect(p.userRole.deleteMany).toHaveBeenCalled();
  });
  it('plan edits are audited with before and after', async () => { const { svc, audit } = mk(); await svc.updatePlan(sup, 'pro', { name: 'Pro+' }); expect(audit.log.mock.calls[0].slice(0, 3)).toEqual(['s', 'plan.update', 'plan:pro']); expect(audit.log.mock.calls[0][3]).toHaveProperty('before'); });
  it('ticket updates are audited; unknown ticket 404s', async () => { const a = mk(); await a.svc.updateTicket(admin, 't', { status: 'CLOSED' }); expect(a.audit.log).toHaveBeenCalled(); const b = mk(); b.p.supportTicket.updateMany.mockResolvedValue({ count: 0 }); await expect(b.svc.updateTicket(admin, 't', { status: 'OPEN' })).rejects.toThrow(NotFoundException); });
});

describe('estimateCost', () => {
  const rows = [{ model: 'm1', requests: 2, failures: 0, inputTokens: 1_000_000, outputTokens: 500_000 }, { model: 'm2', requests: 1, failures: 1, inputTokens: 10, outputTokens: 10 }];
  it('prices only models with configured pricing and flags the rest', () => {
    const r = estimateCost(rows, { currency: 'USD', models: { m1: { inputPer1M: 1, outputPer1M: 2 } } }); expect(r.total).toBe(2); expect(r.unpricedModels).toEqual(['m2']); expect(r.models[1].cost).toBeNull();
  });
  it('returns null total when nothing is priced', () => expect(estimateCost(rows, { currency: 'USD', models: {} }).total).toBeNull());
});

describe('AiMonitorService', () => {
  it('aggregates requests, failures, tokens and rates from log groups', async () => {
    const p: any = { aiRequestLog: { groupBy: jest.fn(async () => [{ model: 'm1', status: 'ok', _count: { _all: 8 }, _sum: { promptTokens: 800, completionTokens: 200, latencyMs: 8000 } }, { model: 'm1', status: 'error', _count: { _all: 2 }, _sum: { promptTokens: null, completionTokens: null, latencyMs: 2000 } }]), findMany: jest.fn(async () => []) },
      $queryRaw: jest.fn(async () => []), usageRecord: { aggregate: jest.fn(async () => ({ _sum: { quantity: 12.34 } })) }, platformSetting: { findUnique: jest.fn(async () => null) }, answerFeedback: { groupBy: jest.fn(async () => [{ rating: 1, _count: { _all: 3 } }, { rating: -1, _count: { _all: 1 } }]) } };
    const r = await new AiMonitorService(p).ai(7); expect(r.totals).toMatchObject({ requests: 10, failures: 2, failureRate: 20, inputTokens: 800, outputTokens: 200, avgLatencyMs: 1000 });
    expect(r.cost.total).toBeNull(); expect(r.transcription).toEqual({ minutes: 12.3, estimatedCost: null }); expect(r.feedback).toEqual({ helpful: 3, notHelpful: 1, helpfulRate: 75 });
  });
});

describe('OpenAiProvider request logging', () => {
  beforeEach(() => Object.assign(process.env, { DATABASE_URL: 'x', JWT_SECRET: 'x'.repeat(32), FRONTEND_URL: 'http://a.co', BACKEND_URL: 'http://b.co', REDIS_URL: 'r', OPENAI_API_KEY: 'sk' }));
  afterEach(() => { delete process.env.OPENAI_API_KEY; });
  const mk = () => { const create = jest.fn(async () => ({})); return { create, p: new OpenAiProvider({ aiRequestLog: { create } } as any) }; };
  it('logs tokens and metadata on success, never the prompt or output', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 11, completion_tokens: 7 } }) }));
    const { create, p } = mk(); expect(await p.jsonCompletion('SYSTEM PROMPT', 'secret user text')).toEqual({ a: 1 });
    const d = (create.mock.calls[0] as any)[0].data; expect(d).toMatchObject({ status: 'ok', promptTokens: 11, completionTokens: 7, provider: 'openai' }); expect(JSON.stringify(d)).not.toContain('secret user text');
  });
  it('logs failures with the HTTP status', async () => { (global as any).fetch = jest.fn(async () => ({ ok: false, status: 429 })); const { create, p } = mk(); await expect(p.jsonCompletion('s', 'u')).rejects.toThrow(); expect((create.mock.calls[0] as any)[0].data).toMatchObject({ status: 'error', httpStatus: 429 }); });
  it('does not fail the request when logging fails', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) }));
    const p = new OpenAiProvider({ aiRequestLog: { create: jest.fn(async () => { throw new Error('db'); }) } } as any); await expect(p.jsonCompletion('s', 'u')).resolves.toEqual({});
  });
});
