import { BadRequestException, Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { createInterviewSchema } from '@justiceview/validation';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { InterviewsService } from './interviews.service';

@Controller('interviews')
@UseGuards(AuthGuard, RolesGuard)
export class InterviewsController {
  constructor(private svc: InterviewsService) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const r = createInterviewSchema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return this.svc.create(u.id, r.data);
  }
  @Get() list(@CurrentUser() u: AuthUser, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('q') q?: string, @Query('status') status?: string, @Query('category') category?: string) {
    return this.svc.list(u.id, Math.max(1, page), 20, q?.slice(0, 100), status, category?.slice(0, 40));
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u.id, id); }
  @Get(':id/transcripts') tr(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) { return this.svc.transcripts(u.id, id, Math.max(1, page)); }
  @Post(':id/start') start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.transition(u.id, id, 'start'); }
  @Post(':id/pause') pause(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.transition(u.id, id, 'pause'); }
  @Post(':id/resume') resume(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.transition(u.id, id, 'resume'); }
  @Post(':id/end') end(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.transition(u.id, id, 'end'); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u.id, id); }
}
