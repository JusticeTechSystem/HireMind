import { SessionRegistry } from './session-registry';
import { aiContext } from '../ai/ai-context';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { loadEnv } from '@hiremind/config';
import { verifyAccessToken } from './token';
import { PrismaService } from '../prisma/prisma.service';

/** Verifies a Supabase-issued access token (HS256, signed with JWT_SECRET) and attaches the local user. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly sessions?: SessionRegistry) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    let claims: jwt.JwtPayload;
    try {
      claims = verifyAccessToken(header.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!claims.sub || typeof claims.email !== 'string') throw new UnauthorizedException('Malformed token');
    const user = await this.prisma.user.upsert({
      where: { id: claims.sub },
      update: {},
      create: { id: claims.sub, email: claims.email, roles: { create: { role: { connect: { name: 'USER' } } } } },
      include: { roles: { include: { role: true } } },
    });
    // A still-valid token for a deleted account must not silently recreate it: fresh rows are checked against the tombstone.
    if (user.createdAt && Date.now() - user.createdAt.getTime() < 10_000 && (await this.prisma.deletedAccount?.findUnique({ where: { id: user.id } }))) {
      await this.prisma.user.delete({ where: { id: user.id } }); throw new UnauthorizedException('Account deleted');
    }
    if (user.suspended) throw new ForbiddenException('Account suspended');
    await this.sessions?.check(user.id, claims, req.headers['user-agent'], req.ip);
    aiContext.enterWith({ userId: user.id });
    req.user = { id: user.id, email: user.email, roles: user.roles.map((r) => r.role.name), sessionId: claims.session_id };
    return true;
  }
}
