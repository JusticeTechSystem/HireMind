import { Controller, Get, Global, Module, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import type { AuthUser } from './auth.types';
import { CurrentUser, RolesGuard } from './roles';
import { SessionRegistry } from './session-registry';

@Controller('sessions')
@UseGuards(AuthGuard, RolesGuard)
export class SessionsController {
  constructor(private svc: SessionRegistry) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u.id, u.sessionId); }
  @Post('revoke-others') others(@CurrentUser() u: AuthUser) { return this.svc.revokeOthers(u.id, u.sessionId); }
  @Post(':id/revoke') revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revoke(u.id, id); }
}

@Global() @Module({ controllers: [SessionsController], providers: [SessionRegistry], exports: [SessionRegistry] })
export class SessionsModule {}
