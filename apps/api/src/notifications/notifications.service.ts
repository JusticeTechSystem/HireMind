import { Controller, Get, Injectable, Logger, Param, ParseUUIDPipe, Patch, Post, UseGuards, Global, Module } from '@nestjs/common';
import { loadEnv } from '@justiceview/config';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RolesGuard } from '../auth/roles';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Resend transactional email. Returns false (never throws) when unconfigured or failing. */
@Injectable()
export class Mailer {
  private log = new Logger('Mailer');
  async send(to: string, subject: string, text: string): Promise<boolean> {
    const e = loadEnv(); if (!e.RESEND_API_KEY) return false;
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: e.RESEND_FROM ?? 'JusticeView <onboarding@resend.dev>', to: [to], subject, text, html: `<p>${esc(text).replace(/\\n/g, '<br>')}</p>` }) });
      if (!r.ok) this.log.warn(`Resend responded ${r.status}`); return r.ok;
    } catch (err) { this.log.warn(`email failed: ${(err as Error).message}`); return false; }
  }
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private mailer: Mailer) {}
  /** Always stores an in-app notification; also emails when requested and Resend is configured. */
  async notify(userId: string, type: string, title: string, body: string, opts: { email?: boolean } = {}) {
    const n = await this.prisma.notification.create({ data: { userId, type, title, body } });
    if (opts.email) { const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }); if (u) await this.mailer.send(u.email, title, body); }
    return n;
  }
  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId, readAt: null } })]);
    return { items, unread };
  }
  async markRead(userId: string, id: string) { await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } }); return { ok: true }; }
  async markAll(userId: string) { await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } }); return { ok: true }; }
}

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u.id); }
  @Post('read-all') all(@CurrentUser() u: AuthUser) { return this.svc.markAll(u.id); }
  @Patch(':id/read') read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(u.id, id); }
}

@Global() @Module({ controllers: [NotificationsController], providers: [Mailer, NotificationsService], exports: [NotificationsService, Mailer] })
export class NotificationsModule {}
