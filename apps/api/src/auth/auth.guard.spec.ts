import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles';

const SECRET = 'x'.repeat(32);
const ctx = (headers: Record<string, string>, extra: object = {}) => {
  const req: any = { headers, ...extra };
  return { req, c: { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => null, getClass: () => null } as unknown as ExecutionContext };
};
const prisma: any = { user: { upsert: jest.fn(async ({ where }: any) => ({ id: where.id, email: 'a@b.co', suspended: false, roles: [{ role: { name: 'USER' } }] })) } };

beforeAll(() => Object.assign(process.env, { DATABASE_URL: 'x', JWT_SECRET: SECRET, FRONTEND_URL: 'http://a.co', BACKEND_URL: 'http://b.co', REDIS_URL: 'r' }));

describe('AuthGuard', () => {
  const g = new AuthGuard(prisma);
  it('rejects missing token', async () => { await expect(g.canActivate(ctx({}).c)).rejects.toThrow(UnauthorizedException); });
  it('rejects token signed with wrong secret', async () => {
    const t = jwt.sign({ sub: 'u1', email: 'a@b.co' }, 'y'.repeat(32));
    await expect(g.canActivate(ctx({ authorization: `Bearer ${t}` }).c)).rejects.toThrow(UnauthorizedException);
  });
  it('rejects expired token', async () => {
    const t = jwt.sign({ sub: 'u1', email: 'a@b.co' }, SECRET, { expiresIn: -10 });
    await expect(g.canActivate(ctx({ authorization: `Bearer ${t}` }).c)).rejects.toThrow(UnauthorizedException);
  });
  it('accepts valid token and attaches user', async () => {
    const t = jwt.sign({ sub: 'u1', email: 'a@b.co' }, SECRET);
    const { c, req } = ctx({ authorization: `Bearer ${t}` });
    await expect(g.canActivate(c)).resolves.toBe(true);
    expect(req.user.id).toBe('u1');
  });
  it('blocks suspended users', async () => {
    prisma.user.upsert.mockResolvedValueOnce({ id: 'u2', email: 'a@b.co', suspended: true, roles: [] });
    const t = jwt.sign({ sub: 'u2', email: 'a@b.co' }, SECRET);
    await expect(g.canActivate(ctx({ authorization: `Bearer ${t}` }).c)).rejects.toThrow(ForbiddenException);
  });
});

describe('RolesGuard', () => {
  const mk = (need: string[]) => new RolesGuard({ getAllAndOverride: () => need } as any);
  it('denies non-admin from admin routes', () => {
    expect(() => mk(['ADMIN']).canActivate(ctx({}, { user: { roles: ['USER'] } }).c)).toThrow(ForbiddenException);
  });
  it('allows matching role', () => {
    expect(mk(['ADMIN']).canActivate(ctx({}, { user: { roles: ['ADMIN'] } }).c)).toBe(true);
  });
});
