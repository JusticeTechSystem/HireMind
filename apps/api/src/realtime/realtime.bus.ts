import { Global, Injectable, Module } from '@nestjs/common';
import type { Server } from 'socket.io';
/** Lets REST services publish to a session room without depending on the gateway. */
@Injectable()
export class RealtimeBus {
  server?: Server;
  toUser(userId: string, event: string, payload: unknown) { this.server?.to(`user:${userId}`).emit(event, payload); }
  disconnectUser(userId: string) { this.server?.in(`user:${userId}`).disconnectSockets(true); }
  toSession(sessionId: string, event: string, payload: unknown) { this.server?.to(`session:${sessionId}`).emit(event, payload); }
}
@Global() @Module({ providers: [RealtimeBus], exports: [RealtimeBus] })
export class RealtimeModule {}
