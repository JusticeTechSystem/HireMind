import { resumeProfileSchema } from '@justiceview/validation';
import { retrieveContext } from '../resumes/retrieval';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';
@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService, private bus: RealtimeBus) {}
  private async owned(userId: string, id: string) {
    if (!(await this.prisma.interviewSession.findFirst({ where: { id, userId }, select: { id: true } }))) throw new NotFoundException('Session not found');
  }
  async list(userId: string, sessionId: string) {
    await this.owned(userId, sessionId);
    return this.prisma.interviewQuestion.findMany({ where: { sessionId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { answers: { orderBy: { createdAt: 'desc' }, take: 1, include: { feedback: { where: { userId }, select: { rating: true } } } } } });
  }
  /** Right-hand panel data: what in the user's own resume relates to a question, plus session insights. Deterministic (no model call). */
  async context(userId: string, sessionId: string, questionId?: string) {
    const s = await this.prisma.interviewSession.findFirst({ where: { id: sessionId, userId }, include: { resume: { select: { fileName: true, structured: true } } } });
    if (!s) throw new NotFoundException('Session not found');
    const q = questionId ? await this.prisma.interviewQuestion.findFirst({ where: { id: questionId, sessionId } }) : await this.prisma.interviewQuestion.findFirst({ where: { sessionId }, orderBy: { createdAt: 'desc' } });
    const parsed = resumeProfileSchema.safeParse(s.resume?.structured); const items = q && parsed.success ? retrieveContext(parsed.data, q.text, 10) : [];
    const [questions, answered] = await Promise.all([this.prisma.interviewQuestion.count({ where: { sessionId } }), this.prisma.interviewQuestion.count({ where: { sessionId, answers: { some: {} } } })]);
    return { resume: s.resume ? { fileName: s.resume.fileName, analyzed: parsed.success } : null, question: q ? { id: q.id, text: q.text, category: q.category, difficulty: q.difficulty, confidence: q.confidence } : null,
      skills: items.filter((i) => i.kind === 'skill').map((i) => i.label), experience: items.filter((i) => i.kind === 'employment').map((i) => i.label), projects: items.filter((i) => i.kind === 'project').map((i) => i.label),
      insights: { questions, answered, minutes: Math.round(s.activeMs / 60000), category: s.category } };
  }
  /** Manual entry: works without AI/transcription configured. */
  async addManual(userId: string, sessionId: string, text: string) {
    await this.owned(userId, sessionId);
    const q = await this.prisma.interviewQuestion.create({ data: { sessionId, text, category: 'general', confidence: 1, source: 'manual' } });
    this.bus.toSession(sessionId, 'question:detected', { questionId: q.id }); return q;
  }
}
