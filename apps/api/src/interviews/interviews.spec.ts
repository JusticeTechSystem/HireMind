import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { assertTransition } from './lifecycle';
import { InterviewsService } from './interviews.service';

describe('lifecycle', () => {
  it('allows the happy path', () => {
    expect(assertTransition('CREATED', 'start')).toBe('ACTIVE');
    expect(assertTransition('ACTIVE', 'pause')).toBe('PAUSED');
    expect(assertTransition('PAUSED', 'resume')).toBe('ACTIVE');
    expect(assertTransition('PAUSED', 'end')).toBe('COMPLETED');
  });
  it('rejects illegal transitions', () => {
    expect(() => assertTransition('CREATED', 'pause')).toThrow(ConflictException);
    expect(() => assertTransition('COMPLETED', 'resume')).toThrow(ConflictException);
    expect(() => assertTransition('ACTIVE', 'start')).toThrow(ConflictException);
  });
});

describe('InterviewsService', () => {
  const t0 = new Date('2026-01-01T10:00:00Z');
  const mk = (row: any, count = 1) => {
    const prisma: any = { interviewSession: { findFirst: jest.fn(async () => row), updateMany: jest.fn(async () => ({ count })) }, resume: { findFirst: jest.fn(async () => null) } };
    return { prisma, svc: new InterviewsService(prisma) };
  };
  it('accumulates active time on pause', async () => {
    const { prisma, svc } = mk({ id: 's', status: 'ACTIVE', activeMs: 1000, lastResumedAt: t0 });
    await svc.transition('u', 's', 'pause', new Date(t0.getTime() + 5000));
    expect(prisma.interviewSession.updateMany).toHaveBeenCalledWith({ where: { id: 's', userId: 'u', status: 'ACTIVE' }, data: { status: 'PAUSED', activeMs: 6000, lastResumedAt: null } });
  });
  it('does not count paused time on end', async () => {
    const { prisma, svc } = mk({ id: 's', status: 'PAUSED', activeMs: 4000, lastResumedAt: null });
    await svc.transition('u', 's', 'end', new Date(t0.getTime() + 99999));
    expect(prisma.interviewSession.updateMany.mock.calls[0][0].data.activeMs).toBe(4000);
  });
  it('404s for sessions the user does not own', async () => {
    await expect(mk(null).svc.get('u', 'x')).rejects.toThrow(NotFoundException);
  });
  it('reports a conflict if a concurrent transition won', async () => {
    const { svc } = mk({ id: 's', status: 'CREATED', activeMs: 0, lastResumedAt: null }, 0);
    await expect(svc.transition('u', 's', 'start')).rejects.toThrow(ConflictException);
  });
  it("rejects another user's resume on create", async () => {
    await expect(mk(null).svc.create('u', { title: 'abc', category: 'mixed', resumeId: '00000000-0000-0000-0000-000000000000' })).rejects.toThrow(BadRequestException);
  });
});
