import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { transcriptFinalSchema } from '@justiceview/validation';
import { OpenAiRealtimeProvider } from './provider';
import { RealtimeGateway } from './realtime.gateway';
import { TranscriptionService } from './transcription.service';

const SECRET = 'x'.repeat(32); const SID = '11111111-1111-4111-8111-111111111111';
const base = { DATABASE_URL: 'x', JWT_SECRET: SECRET, FRONTEND_URL: 'http://a.co', BACKEND_URL: 'http://b.co', REDIS_URL: 'r' };
beforeEach(() => { for (const k of ['OPENAI_API_KEY']) delete process.env[k]; Object.assign(process.env, base); });
const ev = { sessionId: SID, source: 'MICROPHONE' as const, eventId: 'MICROPHONE:item1', text: 'hello', offsetMs: 10 };

describe('transcript schema', () => {
  it('accepts a valid final', () => expect(transcriptFinalSchema.safeParse(ev).success).toBe(true));
  it('rejects empty text, bad source, negative offset', () => {
    expect(transcriptFinalSchema.safeParse({ ...ev, text: '  ' }).success).toBe(false);
    expect(transcriptFinalSchema.safeParse({ ...ev, source: 'OTHER' }).success).toBe(false);
    expect(transcriptFinalSchema.safeParse({ ...ev, offsetMs: -1 }).success).toBe(false);
  });
});

describe('TranscriptionService', () => {
  const mk = (status: string | null, createImpl?: () => Promise<unknown>) => {
    const prisma: any = { interviewSession: { findFirst: jest.fn(async () => (status ? { status } : null)) }, transcript: { create: jest.fn(createImpl ?? (async () => ({}))) } };
    return { prisma, svc: new TranscriptionService(prisma, { mintBrowserCredential: jest.fn(async () => ({ token: 't', expiresAt: 1, url: 'u' })) } as any) };
  };
  it('persists a new final', async () => expect(await mk('ACTIVE').svc.ingest('u', ev)).toEqual({ created: true }));
  it('treats duplicate eventId (P2002) as created:false', async () => {
    const { svc } = mk('ACTIVE', async () => { throw Object.assign(new Error('dup'), { code: 'P2002' }); });
    expect(await svc.ingest('u', ev)).toEqual({ created: false });
  });
  it('rethrows other database errors', async () => {
    await expect(mk('ACTIVE', async () => { throw new Error('boom'); }).svc.ingest('u', ev)).rejects.toThrow('boom');
  });
  it('rejects sessions that are not live or not owned', async () => {
    await expect(mk('CREATED').svc.ingest('u', ev)).rejects.toThrow(ConflictException);
    await expect(mk('COMPLETED').svc.ingest('u', ev)).rejects.toThrow(ConflictException);
    await expect(mk(null).svc.ingest('u', ev)).rejects.toThrow(NotFoundException);
  });
  it('only mints credentials for ACTIVE sessions (not paused)', async () => {
    await expect(mk('PAUSED').svc.credential('u', SID)).rejects.toThrow(ConflictException);
    expect((await mk('ACTIVE').svc.credential('u', SID)).token).toBe('t');
  });
});

describe('OpenAiRealtimeProvider', () => {
  it('is 503 without credentials', async () => { await expect(new OpenAiRealtimeProvider().mintBrowserCredential()).rejects.toThrow(ServiceUnavailableException); });
  it('mints with the server key and requests a transcription session', async () => {
    process.env.OPENAI_API_KEY = 'sk-server';
    const f = jest.fn(async () => ({ ok: true, json: async () => ({ value: 'ek_1', expires_at: 99 }) }));
    (global as any).fetch = f;
    const c = await new OpenAiRealtimeProvider().mintBrowserCredential();
    expect(c.token).toBe('ek_1');
    const [, init] = (f.mock.calls[0] as unknown) as [string, { headers: Record<string, string>; body: string }];
    expect(init.headers.Authorization).toBe('Bearer sk-server');
    expect(JSON.parse(init.body).session.type).toBe('transcription');
  });
});

describe('RealtimeGateway', () => {
  const sock = (token?: string, rooms: string[] = []) => ({ handshake: { auth: { token } }, data: {} as any, rooms: new Set(rooms), disconnect: jest.fn(), join: jest.fn(), leave: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) });
  const mk = (ingest = jest.fn(async () => ({ created: true }))) => {
    const interviews: any = { get: jest.fn(async (u: string) => { if (u !== 'owner') throw new NotFoundException(); return {}; }) };
    const server: any = { to: jest.fn(() => ({ emit: jest.fn() })) };
    const g = new RealtimeGateway(interviews, { ingest } as any, { server } as any, { push: jest.fn() } as any); (g as any).server = server; return { g, ingest, server };
  };
  it('disconnects sockets with bad tokens', () => { const s = sock('nope'); mk().g.handleConnection(s as any); expect(s.disconnect).toHaveBeenCalled(); });
  it('authenticates valid tokens and binds user id', () => {
    const s = sock(jwt.sign({ sub: 'owner', email: 'a@b.co' }, SECRET)); mk().g.handleConnection(s as any); expect(s.data.userId).toBe('owner');
  });
  it('refuses to join a session the user does not own', async () => {
    const s = sock(); s.data.userId = 'intruder';
    expect(await mk().g.join(s as any, { sessionId: SID })).toEqual({ ok: false, error: 'not_found' }); expect(s.join).not.toHaveBeenCalled();
  });
  it('rejects finals from sockets that have not joined the room', async () => {
    const { g, ingest } = mk(); const s = sock(); s.data.userId = 'owner';
    expect((await g.final(s as any, ev)).ok).toBe(false); expect(ingest).not.toHaveBeenCalled();
  });
  it('ingests finals from joined sockets and rejects malformed payloads', async () => {
    const { g, ingest } = mk(); const s = sock(undefined, [`session:${SID}`]); s.data.userId = 'owner';
    expect(await g.final(s as any, ev)).toEqual({ ok: true, created: true }); expect(ingest).toHaveBeenCalledWith('owner', ev);
    expect((await g.final(s as any, { ...ev, text: '' })).ok).toBe(false);
  });
});
