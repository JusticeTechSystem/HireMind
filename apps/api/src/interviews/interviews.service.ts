import { UsageService } from '../billing/usage.service';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { CreateInterviewInput } from '@justiceview/validation';
import { PrismaService } from '../prisma/prisma.service';
import { Action, rule } from './lifecycle';
import { RealtimeBus } from '../realtime/realtime.bus';

const EVT = { start: 'started', pause: 'paused', resume: 'resumed', end: 'completed' } as const;

@Injectable()
export class InterviewsService {
  constructor(private prisma: PrismaService, @Optional() private bus?: RealtimeBus, @Optional() private limits?: UsageService) {}

  async create(userId: string, input: CreateInterviewInput) {
    if (input.resumeId) {
      const own = await this.prisma.resume.findFirst({ where: { id: input.resumeId, userId }, select: { id: true } });
      if (!own) throw new BadRequestException('Resume not found');
    }
    return this.prisma.interviewSession.create({ data: { userId, title: input.title, category: input.category, resumeId: input.resumeId } });
  }

  async list(userId: string, page = 1, pageSize = 20, q?: string, status?: string, category?: string) {
    const where = { userId, ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(status && ['CREATED', 'ACTIVE', 'PAUSED', 'COMPLETED'].includes(status) ? { status: status as never } : {}), ...(category ? { category } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.interviewSession.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.interviewSession.count({ where })]);
    return { items, total, page, pageSize };
  }

  async get(userId: string, id: string) {
    const s = await this.prisma.interviewSession.findFirst({ where: { id, userId }, include: { resume: { select: { id: true, fileName: true, analysisStatus: true } } } });
    if (!s) throw new NotFoundException('Session not found'); // same 404 for other users' sessions
    return s;
  }

  /** Atomic transition: the status predicate in updateMany prevents double-apply races. */
  async transition(userId: string, id: string, action: Action, now = new Date()) {
    const s = await this.get(userId, id);
    const r = rule(action);
    if (!r.from.includes(s.status as never)) throw new ConflictException(`Cannot ${action} a ${s.status} session`);
    const running = s.status === 'ACTIVE' && s.lastResumedAt ? now.getTime() - s.lastResumedAt.getTime() : 0;
    const data: Record<string, unknown> = { status: r.to };
    if (action === 'start') { data.startedAt = now; data.lastResumedAt = now; }
    if (action === 'resume') data.lastResumedAt = now;
    if (action === 'pause' || action === 'end') { data.activeMs = s.activeMs + running; data.lastResumedAt = null; }
    if (action === 'end') data.endedAt = now;
    const { count } = await this.prisma.interviewSession.updateMany({ where: { id, userId, status: s.status }, data });
    if (count === 0) throw new ConflictException('Session changed concurrently, retry');
    const updated = await this.get(userId, id);
    // Meter transcription as active session time (an upper bound on capture time; capture runs client-side).
    if ((action === 'pause' || action === 'end') && running > 0) await this.limits?.record(userId, 'transcriptionMinutes', running / 60000);
    this.bus?.toSession(id, `session:${EVT[action]}`, { sessionId: id, status: updated.status });
    return updated;
  }

  async transcripts(userId: string, id: string, page = 1, pageSize = 200) {
    await this.get(userId, id);
    const items = await this.prisma.transcript.findMany({ where: { sessionId: id }, orderBy: { offsetMs: 'asc' }, skip: (page - 1) * pageSize, take: pageSize });
    return { items, page, pageSize };
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.interviewSession.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException('Session not found');
    return { ok: true };
  }
}
