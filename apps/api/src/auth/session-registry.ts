import { Controller, Get, Global, Injectable, Module, NotFoundException, Optional, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { AuthGuard } from './auth.guard';
import { CurrentUser, RolesGuard } from './roles';
import type { AuthUser } from './auth.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 30_000;

/**
 * Tracks login sessions (Supabase `session_id` claim) so users can see and revoke devices. A revoked session is rejected by this API
 * (HTTP and Socket.IO) even though Supabase's own refresh token still works: refreshing keeps the same session id, which stays revoked.
 * Revocation is cached for 30 s per instance, so other instances may honour a revoked session for up to 30 s.
 */
@Injectable()
export class SessionRegistry {
  private cache = new Map<string, { revoked: boolean; at: number }>();
  constructor(private prisma: PrismaService, @Optional() private bus?: RealtimeBus) {}

  static ipPrefix(ip?: string) { if (!ip) return null; return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::' : ip.replace(/\d+$/, '0'); } // stored coarsely on purpose

  async check(userId: string, claims: { session_id?: string }, ua?: string, ip?: string, now = Date.now()) {
    const id = claims.session_id; if (!id || !UUID.test(id)) return; // tokens without a session id are not tracked
    const hit = this.cache.get(id);
    if (hit && now - hit.at < TTL_MS) { if (hit.revoked) throw new UnauthorizedException('Session revoked'); return; }
    const row = await this.prisma.userSession.upsert({ where: { id }, create: { id, userId, userAgent: ua?.slice(0, 200), ipPrefix: SessionRegistry.ipPrefix(ip) }, update: { lastSeenAt: new Date(now) } });
    if (row.userId !== userId) throw new UnauthorizedException('Session mismatch'); // a session id can never be adopted by another user
    this.cache.set(id, { revoked: !!row.revokedAt, at: now });
    if (row.revokedAt) throw new UnauthorizedException('Session revoked');
  }
  async isRevoked(id: string, now = Date.now()) {
    const hit = this.cache.get(id); if (hit && now - hit.at < TTL_MS) return hit.revoked;
    const row = await this.prisma.userSession.findUnique({ where: { id }, select: { revokedAt: true } }); const revoked = !!row?.revokedAt; this.cache.set(id, { revoked, at: now }); return revoked;
  }
  async list(userId: string, currentId?: string) {
    const rows = await this.prisma.userSession.findMany({ where: { userId, revokedAt: null, lastSeenAt: { gte: new Date(Date.now() - 30 * 864e5) } }, orderBy: { lastSeenAt: 'desc' }, take: 50 });
    return rows.map((r) => ({ id: r.id, userAgent: r.userAgent, ipPrefix: r.ipPrefix, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, current: r.id === currentId }));
  }
  async revoke(userId: string, id: string) {
    const { count } = await this.prisma.userSession.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } }); // ownership in the query
    if (!count) throw new NotFoundException('Session not found');
    this.cache.set(id, { revoked: true, at: Date.now() }); this.bus?.disconnectUser(userId); return { ok: true };
  }
  async revokeOthers(userId: string, currentId?: string) {
    const rows = await this.prisma.userSession.findMany({ where: { userId, revokedAt: null, ...(currentId ? { id: { not: currentId } } : {}) }, select: { id: true } });
    if (rows.length) await this.prisma.userSession.updateMany({ where: { id: { in: rows.map((r) => r.id) }, userId }, data: { revokedAt: new Date() } });
    for (const r of rows) this.cache.set(r.id, { revoked: true, at: Date.now() });
    if (rows.length) this.bus?.disconnectUser(userId); return { revoked: rows.length };
  }
  async revokeAll(userId: string) { const r = await this.revokeOthers(userId, undefined); return r; }
}

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
