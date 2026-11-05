import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { ServerOptions } from 'socket.io';

/** Shares Socket.IO rooms/events across API instances through Redis. Enabled with SOCKET_REDIS=true; startup fails if Redis is unreachable. */
export class RedisIoAdapter extends IoAdapter {
  private adapterCtor?: ReturnType<typeof createAdapter>;
  constructor(app: INestApplicationContext) { super(app); }
  async connect(url: string) {
    const pub = createClient({ url }); const sub = pub.duplicate();
    pub.on('error', (e) => console.error('redis pub error', e.message)); sub.on('error', (e) => console.error('redis sub error', e.message));
    await Promise.all([pub.connect(), sub.connect()]); this.adapterCtor = createAdapter(pub, sub);
  }
  createIOServer(port: number, options?: ServerOptions) { const server = super.createIOServer(port, options); if (this.adapterCtor) server.adapter(this.adapterCtor); return server; }
}
