import { UsageService } from '../billing/usage.service';
import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { TranscriptFinal } from '@justiceview/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TranscriptionProvider } from './provider';

@Injectable()
export class TranscriptionService {
  constructor(private prisma: PrismaService, private provider: TranscriptionProvider, @Optional() private limits?: UsageService) {}

  private async liveSession(userId: string, sessionId: string, allowPaused: boolean) {
    const s = await this.prisma.interviewSession.findFirst({ where: { id: sessionId, userId }, select: { status: true } });
    if (!s) throw new NotFoundException('Session not found');
    if (s.status === 'ACTIVE' || (allowPaused && s.status === 'PAUSED')) return s;
    throw new ConflictException('Session is not active');
  }

  async credential(userId: string, sessionId: string) {
    await this.liveSession(userId, sessionId, false);
    await this.limits?.assertWithin(userId, 'transcriptionMinutes'); // also gates reconnect credentials once the monthly allowance is spent
    return this.provider.mintBrowserCredential();
  }

  /** Idempotent: the (sessionId,eventId) unique key makes replays and reconnect retries harmless. */
  async ingest(userId: string, e: TranscriptFinal): Promise<{ created: boolean }> {
    await this.liveSession(userId, e.sessionId, true); // a final landing just after pause is still accepted
    try {
      await this.prisma.transcript.create({ data: { sessionId: e.sessionId, source: e.source, text: e.text, offsetMs: e.offsetMs, eventId: e.eventId } });
      return { created: true };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return { created: false };
      throw err;
    }
  }
}
