import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { TranscriptionService } from './transcription.service';

@Controller('interviews')
@UseGuards(AuthGuard, RolesGuard)
export class TranscriptionController {
  constructor(private svc: TranscriptionService) {}
  @Post(':id/transcription/token') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  token(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.credential(u.id, id); }
}
