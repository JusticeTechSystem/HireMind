import { BadRequestException, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { MAX_RESUME_BYTES } from './file-validation';
import { ResumesService } from './resumes.service';

@Controller('resumes')
@UseGuards(AuthGuard, RolesGuard)
export class ResumesController {
  constructor(private svc: ResumesService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u.id); }
  @Post() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RESUME_BYTES, files: 1 } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() f?: { buffer: Buffer; originalname: string }) {
    if (!f) throw new BadRequestException('file is required');
    return this.svc.upload(u.id, f);
  }
  @Get(':id/url') url(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.url(u.id, id); }
  @Patch(':id/default') def(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.setDefault(u.id, id); }
  @Post(':id/analyze') @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async analyze(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { await this.svc.analyze(u.id, id); return { ok: true }; }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u.id, id); }
}
