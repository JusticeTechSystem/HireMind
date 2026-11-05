import { BadRequestException, CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor, UnprocessableEntityException } from '@nestjs/common';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Replays the stored response for a repeated `Idempotency-Key` (per user and route) instead of running the handler twice, so double clicks and
 * client retries cannot create duplicate checkouts, mock interviews, tickets, etc. Requests without the header are unaffected. Failed handlers
 * release the key so the client can retry. Keys are pruned after 24 h by the retention job.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}
  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest(); const key = req.headers['idempotency-key']; const userId: string | undefined = req.user?.id;
    if (!key || !userId) return next.handle();
    if (typeof key !== 'string' || key.length > 100) throw new BadRequestException('Invalid Idempotency-Key');
    const route = `${req.method} ${req.route?.path ?? req.url}`; const id = { userId_key: { userId, key } };
    try { await this.prisma.idempotencyKey.create({ data: { userId, key, route, status: 0 } }); }
    catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      const row = await this.prisma.idempotencyKey.findUnique({ where: id });
      if (!row || row.route !== route) throw new UnprocessableEntityException('Idempotency-Key was already used for a different request');
      if (row.status === 0) throw new ConflictException('A request with this Idempotency-Key is still in progress');
      return of(row.response);
    }
    return next.handle().pipe(
      mergeMap(async (body) => { await this.prisma.idempotencyKey.update({ where: id, data: { status: 200, response: (body ?? null) as never } }); return body; }),
      catchError((err) => from(this.prisma.idempotencyKey.deleteMany({ where: { userId, key } })).pipe(mergeMap(() => throwError(() => err)))));
  }
}
