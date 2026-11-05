import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { answerModeSchema, feedbackSchema } from '@hiremind/validation';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { AnswersService } from './answers.service';
import { QuestionsService } from './questions.service';

const parse = <T>(s: z.ZodType<T>, b: unknown): T => { const r = s.safeParse(b); if (!r.success) throw new BadRequestException(r.error.flatten()); return r.data; };

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class QuestionsController {
  constructor(private qs: QuestionsService, private as: AnswersService) {}
  @Get('interviews/:id/questions') list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.qs.list(u.id, id); }
  @Post('interviews/:id/questions') add(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.qs.addManual(u.id, id, parse(z.object({ text: z.string().trim().min(3).max(600) }), b).text);
  }
  @Post('questions/:qid/answers') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  generate(@CurrentUser() u: AuthUser, @Param('qid', ParseUUIDPipe) qid: string, @Body() b: unknown) {
    return this.as.generate(u.id, qid, parse(z.object({ mode: answerModeSchema }), b).mode);
  }
  @Get('questions/:qid/answers') answers(@CurrentUser() u: AuthUser, @Param('qid', ParseUUIDPipe) qid: string) { return this.as.answers(u.id, qid); }
  @Put('answers/:id/feedback') feedback(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { const x = parse(feedbackSchema, b); return this.as.setFeedback(u.id, id, x.rating, x.comment); }
  @Post('answers/:id/explain') @Throttle({ default: { limit: 20, ttl: 60_000 } }) explain(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.as.explain(u.id, id); }
  @Get('interviews/:id/context') context(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('questionId') qid?: string) { return this.qs.context(u.id, id, qid); }
  @Delete('answers/:id/feedback') clearFeedback(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.as.clearFeedback(u.id, id); }
  @Patch('answers/:id/save') save(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.as.setSaved(u.id, id, parse(z.object({ saved: z.boolean() }), b).saved);
  }
}
