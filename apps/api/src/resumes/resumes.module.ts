import { Module } from '@nestjs/common';
import { AiProvider, OpenAiProvider } from '../ai/ai-provider';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { StorageService } from './storage';
@Module({ controllers: [ResumesController], providers: [ResumesService, StorageService, { provide: AiProvider, useClass: OpenAiProvider }], exports: [ResumesService] })
export class ResumesModule {}
