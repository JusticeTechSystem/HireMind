import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { onboardingSchema, retentionSchema } from '@justiceview/validation';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
@UseGuards(AuthGuard, RolesGuard)
export class ProfilesController {
  constructor(private readonly svc: ProfilesService) {}
  @Get('me') me(@CurrentUser() u: AuthUser) { return this.svc.get(u.id); }
  @Put('me/retention') retention(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const r = retentionSchema.safeParse(body); if (!r.success) throw new BadRequestException(r.error.flatten());
    return this.svc.setRetention(u.id, r.data.days);
  }
  @Put('me') save(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const r = onboardingSchema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return this.svc.save(u.id, r.data);
  }
}
