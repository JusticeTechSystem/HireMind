import { Module } from '@nestjs/common';
import { AnswersService } from './answers.service';
import { QuestionDetector } from './detector';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
@Module({ controllers: [QuestionsController], providers: [QuestionDetector, QuestionsService, AnswersService], exports: [QuestionDetector] })
export class QuestionsModule {}
