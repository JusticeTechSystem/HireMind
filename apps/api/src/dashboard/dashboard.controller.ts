import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Controller('dashboard')
@UseGuards(AuthGuard, RolesGuard)
export class DashboardController {
  constructor(private prisma: PrismaService) {}
  /** All figures are computed from stored records; nothing is hardcoded. */
  @Get() async get(@CurrentUser() u: AuthUser) {
    const [sessions, questions, finished, recent, resume, sub, usage] = await Promise.all([
      this.prisma.interviewSession.count({ where: { userId: u.id } }),
      this.prisma.interviewQuestion.count({ where: { session: { userId: u.id } } }),
      this.prisma.interviewSession.aggregate({ where: { userId: u.id }, _sum: { activeMs: true } }),
      this.prisma.interviewSession.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, status: true, createdAt: true } }),
      this.prisma.resume.findFirst({ where: { userId: u.id, isDefault: true }, select: { id: true, fileName: true, analysisStatus: true } }),
      this.prisma.subscription.findFirst({ where: { userId: u.id, status: 'ACTIVE' }, include: { plan: true } }),
      this.prisma.usageRecord.groupBy({ by: ['metric'], where: { userId: u.id }, _sum: { quantity: true } }),
    ]);
    const [mocks, resumes, profile] = await Promise.all([this.prisma.mockInterview.count({ where: { userId: u.id } }), this.prisma.resume.count({ where: { userId: u.id } }), this.prisma.profile.findUnique({ where: { userId: u.id }, select: { onboardedAt: true, retentionDays: true } })]);
    // Real to-dos derived from the account's actual state
    const tasks = [...(!profile?.onboardedAt ? [{ id: 'profile', label: 'Complete your profile', href: '/onboarding' }] : []), ...(resumes === 0 ? [{ id: 'resume', label: 'Upload a resume so answers can use your real experience', href: '/resumes' }] : []),
      ...(resume && resume.analysisStatus !== 'complete' ? [{ id: 'analysis', label: 'Resume analysis has not completed: re-run it from Resumes', href: '/resumes' }] : []), ...(mocks === 0 ? [{ id: 'mock', label: 'Take your first mock interview', href: '/mock' }] : []),
      ...(sessions === 0 ? [{ id: 'session', label: 'Create a practice session to try the live workspace', href: '/interviews/new' }] : [])];
    const practiceMinutes = Math.round((finished._sum.activeMs ?? 0) / 60000);
    return { tasks, sessions, questions, practiceMinutes, recent, resume, plan: sub?.plan.name ?? 'Free',
      usage: Object.fromEntries(usage.map((x) => [x.metric, x._sum.quantity ?? 0])) };
  }
}
