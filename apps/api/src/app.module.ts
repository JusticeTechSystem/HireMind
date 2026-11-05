import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.service';
import { ProfilesController } from './profiles/profiles.controller';
import { ProfilesService } from './profiles/profiles.service';
import { ResumesModule } from './resumes/resumes.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { InterviewsModule } from './interviews/interviews.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { AiModule } from './ai/ai.module';
import { QuestionsModule } from './questions/questions.module';
import { CodingModule } from './tools/coding.module';
import { MockModule } from './mock/mock.module';
import { HistoryModule } from './history/history.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.service';
import { AdminModule } from './admin/admin.module';
import { AccountModule } from './account/account.module';
import { SessionsModule } from './auth/session-registry';
import { AvatarModule } from './profiles/avatar';
import { CacheModule } from './common/cache';
import { JobsModule } from './jobs/jobs.service';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { loadEnv } from '@justiceview/config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [PrismaModule, CacheModule, JobsModule, SessionsModule, AvatarModule, AccountModule, AdminModule, NotificationsModule, BillingModule, HistoryModule, CodingModule, MockModule, AiModule, QuestionsModule, RealtimeModule, TranscriptionModule, InterviewsModule, ResumesModule, ThrottlerModule.forRootAsync({ useFactory: () => { const e = loadEnv(); return { throttlers: [{ ttl: 60_000, limit: 120 }], storage: e.THROTTLE_REDIS === 'true' ? new ThrottlerStorageRedisService(e.REDIS_URL) : undefined }; } })],
  controllers: [HealthController, ProfilesController, DashboardController],
  providers: [ProfilesService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
