import { IdempotencyInterceptor } from '../common/idempotency';
import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { mockAnswerSchema, mockCreateSchema } from '@justiceview/validation';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { parse } from '../common/parse';
import { MockService } from './mock.service';

@Controller('mock-interviews')
@UseGuards(AuthGuard, RolesGuard)
export class MockController {
  constructor(private svc: MockService) {}
  @Post() @UseInterceptors(IdempotencyInterceptor) @Throttle({ default: { limit: 5, ttl: 60_000 } }) create(@CurrentUser() u: AuthUser, @Body() b: unknown) { return this.svc.create(u.id, parse(mockCreateSchema, b)); }
  @Get() list(@CurrentUser() u: AuthUser, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) { return this.svc.list(u.id, Math.max(1, page)); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.id, id); }
  @Post(':id/questions/:qid/answer') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  answer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('qid', ParseUUIDPipe) qid: string, @Body() b: unknown) {
    return this.svc.answer(u.id, id, qid, parse(mockAnswerSchema, b).answerText);
  }
  @Post(':id/complete') complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.complete(u.id, id); }
}
