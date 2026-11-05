import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  log(actorId: string | null, action: string, target?: string, meta?: unknown) {
    return this.prisma.auditLog.create({ data: { actorId, action, target, meta: meta as never } });
  }
}
