import { Global, Injectable, Module, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RealtimeBus } from '../realtime/realtime.bus';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(@Optional() private readonly bus?: RealtimeBus) { super(); }
  async onModuleInit() {
    // Push `usage:updated` to the user's sockets whenever a usage row is written, wherever in the code that happens.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.$use(async (params: any, next: any) => {
      const r = await next(params);
      if (params.model === 'UsageRecord' && params.action === 'create' && r?.userId) this.bus?.toUser(r.userId, 'usage:updated', { metric: r.metric, quantity: r.quantity });
      return r;
    });
    await this.$connect();
  }
}
@Global() @Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
