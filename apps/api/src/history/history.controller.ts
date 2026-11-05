import { Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { HistoryService } from './history.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class HistoryController {
  constructor(private svc: HistoryService) {}
  @Get('interviews/:id/detail') detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.detail(u.id, id); }
  @Post('interviews/:id/summary') @Throttle({ default: { limit: 5, ttl: 60_000 } }) summary(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.summarize(u.id, id); }
  @Delete('interviews/:id/transcripts') delTr(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteTranscripts(u.id, id); }
  @Get('interviews/:id/export.pdf') @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async pdf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return new StreamableFile(await this.svc.pdf(u.id, id), { type: 'application/pdf', disposition: `attachment; filename="session-${id}.pdf"` });
  }
  @Get('answers/saved') saved(@CurrentUser() u: AuthUser, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) { return this.svc.saved(u.id, Math.max(1, page)); }
}
