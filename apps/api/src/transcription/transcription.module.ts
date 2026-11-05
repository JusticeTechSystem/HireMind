import { Module } from '@nestjs/common';
import { InterviewsModule } from '../interviews/interviews.module';
import { QuestionsModule } from '../questions/questions.module';
import { OpenAiRealtimeProvider, TranscriptionProvider } from './provider';
import { RealtimeGateway } from './realtime.gateway';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionService } from './transcription.service';
@Module({ imports: [InterviewsModule, QuestionsModule], controllers: [TranscriptionController],
  providers: [TranscriptionService, RealtimeGateway, { provide: TranscriptionProvider, useClass: OpenAiRealtimeProvider }] })
export class TranscriptionModule {}
