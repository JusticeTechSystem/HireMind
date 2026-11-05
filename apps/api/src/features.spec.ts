import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { audioStatusSchema, feedbackSchema, retentionSchema } from '@justiceview/validation';
import { AnswersService } from './questions/answers.service';
import { AvatarService, detectImage, MAX_AVATAR_BYTES } from './profiles/avatar';
import { RetentionService, cutoff } from './account/retention.service';
import { SessionRegistry } from './auth/session-registry';
import { RealtimeBus } from './realtime/realtime.bus';
import { RealtimeGateway } from './transcription/realtime.gateway';

const SID = '11111111-1111-4111-8111-111111111111', SECRET = 'x'.repeat(32);
beforeEach(() => { Object.assign(process.env, { DATABASE_URL: 'x', JWT_SECRET: SECRET, FRONTEND_URL: 'http://f.co', BACKEND_URL: 'http://b.co', REDIS_URL: 'r' }); delete process.env.TRANSCRIPT_RETENTION_DAYS_DEFAULT; delete process.env.SUPABASE_URL; });

describe('avatars', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  it('detects PNG/JPEG/WebP by magic bytes', () => {
    expect(detectImage(png).ext).toBe('png'); expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])).mime).toBe('image/jpeg');
    expect(detectImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])).ext).toBe('webp');
  });
  it('rejects SVG, GIF, scripts disguised as images, empty and oversize files', () => {
    for (const b of [Buffer.from('<svg onload=alert(1)>'), Buffer.from('GIF89a....'), Buffer.from('MZ....'), Buffer.alloc(0), Buffer.alloc(MAX_AVATAR_BYTES + 1, 0xff)]) expect(() => detectImage(b)).toThrow(BadRequestException);
  });
  const mk = (old: string | null) => { const prisma: any = { profile: { findUnique: jest.fn(async () => ({ avatarPath: old })), upsert: jest.fn(), update: jest.fn() } }; const storage: any = { put: jest.fn(), remove: jest.fn(async () => undefined), signedUrl: jest.fn(async () => 'https://signed') }; return { prisma, storage, svc: new AvatarService(prisma, storage) }; };
  it('stores under the user folder in the avatar bucket and removes the previous image', async () => {
    const { svc, storage, prisma } = mk('u/old.png'); await svc.upload('u1', { buffer: png });
    expect(storage.put.mock.calls[0][0]).toMatch(/^u1\/avatar-\d+\.png$/); expect(storage.put.mock.calls[0][3]).toBe('avatars'); expect(storage.remove).toHaveBeenCalledWith('u/old.png', 'avatars'); expect(prisma.profile.upsert).toHaveBeenCalled();
  });
  it('returns a signed URL, or null when there is no avatar', async () => { expect((await mk('a.png').svc.url('u1')).url).toBe('https://signed'); expect((await mk(null).svc.url('u1')).url).toBeNull(); });
});

describe('SessionRegistry', () => {
  const mk = (row: any = { userId: 'u1', revokedAt: null }) => { const prisma: any = { userSession: { upsert: jest.fn(async () => row), findUnique: jest.fn(async () => row), findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 1 })) } }; const bus = { disconnectUser: jest.fn() } as any; return { prisma, bus, reg: new SessionRegistry(prisma, bus) }; };
  it('ignores tokens without a session id', async () => { const { reg, prisma } = mk(); await reg.check('u1', {}); expect(prisma.userSession.upsert).not.toHaveBeenCalled(); });
  it('registers a session, caches for 30 s, then re-checks', async () => {
    const { reg, prisma } = mk(); await reg.check('u1', { session_id: SID }, 'UA', '1.2.3.4', 0); await reg.check('u1', { session_id: SID }, 'UA', '1.2.3.4', 10_000); expect(prisma.userSession.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.userSession.upsert.mock.calls[0][0].create.ipPrefix).toBe('1.2.3.0'); await reg.check('u1', { session_id: SID }, 'UA', '1.2.3.4', 31_000); expect(prisma.userSession.upsert).toHaveBeenCalledTimes(2);
  });
  it('rejects revoked sessions and sessions owned by someone else', async () => {
    await expect(mk({ userId: 'u1', revokedAt: new Date() }).reg.check('u1', { session_id: SID })).rejects.toThrow(UnauthorizedException);
    await expect(mk({ userId: 'other', revokedAt: null }).reg.check('u1', { session_id: SID })).rejects.toThrow(UnauthorizedException);
  });
  it('revoke is owner-scoped, 404s otherwise, drops sockets, and takes effect inside the cache window', async () => {
    const { reg, prisma, bus } = mk(); await reg.check('u1', { session_id: SID }, undefined, undefined, 0); await reg.revoke('u1', SID);
    expect(prisma.userSession.updateMany.mock.calls[0][0].where).toEqual({ id: SID, userId: 'u1', revokedAt: null }); expect(bus.disconnectUser).toHaveBeenCalledWith('u1');
    await expect(reg.check('u1', { session_id: SID })).rejects.toThrow(UnauthorizedException);
    prisma.userSession.updateMany.mockResolvedValue({ count: 0 }); await expect(reg.revoke('u2', SID)).rejects.toThrow(NotFoundException);
  });
  it('revoke-others spares the current session', async () => {
    const { reg, prisma } = mk(); prisma.userSession.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]); expect((await reg.revokeOthers('u1', 'cur')).revoked).toBe(2);
    expect(prisma.userSession.findMany.mock.calls[0][0].where.id).toEqual({ not: 'cur' });
  });
  it('anonymises IPs', () => { expect(SessionRegistry.ipPrefix('10.20.30.40')).toBe('10.20.30.0'); expect(SessionRegistry.ipPrefix('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::'); expect(SessionRegistry.ipPrefix(undefined)).toBeNull(); });
});

describe('RetentionService', () => {
  const mk = () => { const prisma: any = { profile: { findMany: jest.fn(async () => [{ userId: 'u30', retentionDays: 30 }, { userId: 'u7', retentionDays: 7 }]) }, transcript: { deleteMany: jest.fn(async () => ({ count: 2 })) }, aiRequestLog: { deleteMany: jest.fn(async () => ({ count: 5 })) }, auditLog: { create: jest.fn() } }; return { prisma, svc: new RetentionService(prisma) }; };
  const now = new Date('2026-11-01T00:00:00Z');
  it("applies each user's own window to that user's transcripts only", async () => {
    const { svc, prisma } = mk(); await svc.run(now); const calls = prisma.transcript.deleteMany.mock.calls.map((c: any) => c[0].where);
    expect(calls).toHaveLength(2); expect(calls[0]).toEqual({ session: { userId: 'u30' }, createdAt: { lt: cutoff(now, 30) } }); expect(calls[1].session.userId).toBe('u7');
  });
  it('applies the platform default only to users who made no choice, and only when configured', async () => {
    const a = mk(); await a.svc.run(now); expect(a.prisma.transcript.deleteMany).toHaveBeenCalledTimes(2);
    process.env.TRANSCRIPT_RETENTION_DAYS_DEFAULT = '90'; const b = mk(); await b.svc.run(now); expect(b.prisma.transcript.deleteMany).toHaveBeenCalledTimes(3);
    expect(b.prisma.transcript.deleteMany.mock.calls[2][0].where.session.user.OR).toEqual([{ profile: { is: null } }, { profile: { retentionDays: null } }]);
  });
  it('prunes AI logs (default 90 days) and audits what it removed, without personal data', async () => {
    const { svc, prisma } = mk(); const r = await svc.run(now); expect(r).toEqual({ transcripts: 4, aiLogs: 5 }); expect(prisma.aiRequestLog.deleteMany.mock.calls[0][0].where.createdAt.lt).toEqual(cutoff(now, 90)); expect(prisma.auditLog.create.mock.calls[0][0].data.meta).toEqual({ transcripts: 4, aiLogs: 5 });
  });
  it('only allows the offered windows', () => { for (const d of [7, 30, 90, 365, null]) expect(retentionSchema.safeParse({ days: d }).success).toBe(true); for (const d of [0, 1, 366, '30']) expect(retentionSchema.safeParse({ days: d }).success).toBe(false); });
});

describe('answer feedback', () => {
  const mk = (own: boolean) => { const prisma: any = { aiAnswer: { findFirst: jest.fn(async () => (own ? { id: 'a' } : null)) }, answerFeedback: { upsert: jest.fn(), deleteMany: jest.fn() } }; return { prisma, svc: new AnswersService(prisma, {} as any) }; };
  it('upserts one rating per user for answers they own', async () => { const { svc, prisma } = mk(true); await svc.setFeedback('u1', 'a', 1, 'nice'); expect(prisma.answerFeedback.upsert.mock.calls[0][0].where).toEqual({ answerId_userId: { answerId: 'a', userId: 'u1' } }); });
  it("404s on someone else's answer and writes nothing", async () => { const { svc, prisma } = mk(false); await expect(svc.setFeedback('u1', 'a', -1)).rejects.toThrow(NotFoundException); expect(prisma.answerFeedback.upsert).not.toHaveBeenCalled(); });
  it('only accepts +1 / -1', () => { expect(feedbackSchema.safeParse({ rating: 1 }).success).toBe(true); expect(feedbackSchema.safeParse({ rating: 5 }).success).toBe(false); expect(feedbackSchema.safeParse({ rating: 0 }).success).toBe(false); });
});

describe('realtime: audio:status, user rooms, revoked sockets, usage events', () => {
  const sock = (token: string, rooms: string[] = []) => ({ handshake: { auth: { token } }, data: {} as any, rooms: new Set(rooms), disconnect: jest.fn(), join: jest.fn(), leave: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) });
  const mk = (revoked = false) => new RealtimeGateway({} as any, {} as any, {} as any, {} as any, { isRevoked: jest.fn(async () => revoked) } as any);
  it('joins a per-user room on connect', async () => { const s = sock(jwt.sign({ sub: 'u1', email: 'a@b.co' }, SECRET)); await mk().handleConnection(s as any); expect(s.join).toHaveBeenCalledWith('user:u1'); });
  it('drops sockets whose login session was revoked', async () => { const s = sock(jwt.sign({ sub: 'u1', email: 'a@b.co', session_id: SID }, SECRET)); await mk(true).handleConnection(s as any); expect(s.disconnect).toHaveBeenCalledWith(true); });
  it('relays validated audio:status from joined sockets only', () => {
    const g = mk(); const ev = { sessionId: SID, source: 'MICROPHONE', status: 'on' };
    expect(g.audio(sock('t', [`session:${SID}`]) as any, ev).ok).toBe(true); expect(g.audio(sock('t') as any, ev).ok).toBe(false); expect(g.audio(sock('t', [`session:${SID}`]) as any, { ...ev, status: 'hacked' }).ok).toBe(false);
    expect(audioStatusSchema.safeParse(ev).success).toBe(true);
  });
  it('RealtimeBus targets the user room and can disconnect all of a user’s sockets', () => {
    const emit = jest.fn(); const disconnectSockets = jest.fn(); const bus = new RealtimeBus(); bus.server = { to: jest.fn(() => ({ emit })), in: jest.fn(() => ({ disconnectSockets })) } as any;
    bus.toUser('u1', 'usage:updated', { metric: 'aiRequests' }); expect((bus.server as any).to).toHaveBeenCalledWith('user:u1'); expect(emit).toHaveBeenCalledWith('usage:updated', { metric: 'aiRequests' });
    bus.disconnectUser('u1'); expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
