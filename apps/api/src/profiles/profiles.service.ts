import { NotificationsService } from '../notifications/notifications.service';
import { Injectable, Optional } from '@nestjs/common';
import { OnboardingInput } from '@hiremind/validation';
import { PrismaService } from '../prisma/prisma.service';

const FIELDS = ['fullName', 'title', 'careerLevel', 'yearsExperience', 'industry', 'specialization',
  'languages', 'frameworks', 'interviewCategory', 'answerStyle', 'objectives'] as const;

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly notifications?: NotificationsService) {}

  /** Completion % over required onboarding fields, plus whether a resume exists (resume is optional). */
  static completion(p: Record<string, unknown> | null) {
    const required = FIELDS.filter((f) => f !== 'objectives');
    const done = required.filter((f) => { const v = p?.[f]; return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== ''; });
    return Math.round((done.length / required.length) * 100);
  }

  async get(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const resumes = await this.prisma.resume.count({ where: { userId } });
    return { profile, completion: ProfilesService.completion(profile as any), hasResume: resumes > 0 };
  }

  async setRetention(userId: string, days: number | null) {
    await this.prisma.profile.upsert({ where: { userId }, create: { userId, retentionDays: days }, update: { retentionDays: days } }); return { retentionDays: days };
  }

  async save(userId: string, input: OnboardingInput) {
    // Ownership is enforced by keying strictly on the authenticated userId.
    const existing = await this.prisma.profile.findUnique({ where: { userId }, select: { onboardedAt: true } });
    const profile = await this.prisma.profile.upsert({
      where: { userId }, create: { userId, ...input, onboardedAt: new Date() }, update: { ...input, onboardedAt: new Date() },
    });
    if (!existing?.onboardedAt) void this.notifications?.notify(userId, 'welcome', 'Welcome to HireMind', 'Your profile is set up. Upload a resume and start a mock interview to get going.', { email: true }).catch(() => undefined);
    return { profile, completion: ProfilesService.completion(profile as any) };
  }
}
