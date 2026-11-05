import { Logger, Optional } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { SessionRegistry } from '../auth/session-registry';
import { audioStatusSchema, sessionRefSchema, transcriptFinalSchema, transcriptPartialSchema } from '@justiceview/validation';
import { verifyAccessToken } from '../auth/token';
import { InterviewsService } from '../interviews/interviews.service';
import { RealtimeBus } from '../realtime/realtime.bus';
import { QuestionDetector } from '../questions/detector';
import { TranscriptionService } from './transcription.service';

const room = (id: string) => `session:${id}`;
type Ack = { ok: boolean; error?: string; created?: boolean };

@WebSocketGateway({ namespace: '/realtime', cors: { origin: process.env.FRONTEND_URL, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private log = new Logger('Realtime');
  constructor(private interviews: InterviewsService, private tx: TranscriptionService, private bus: RealtimeBus, private detector: QuestionDetector, @Optional() private sessions?: SessionRegistry) {}
  afterInit() { this.bus.server = this.server; }

  /** Every socket is bound to an authenticated user; invalid/expired tokens are dropped. */
  async handleConnection(client: Socket) {
    let claims: { sub?: string; session_id?: string };
    try { claims = verifyAccessToken(String(client.handshake.auth?.token ?? '')); client.data.userId = claims.sub; }
    catch { client.disconnect(true); return; }
    void client.join(`user:${claims.sub}`); // per-user room: usage:updated, forced disconnects
    try { if (claims.session_id && (await this.sessions?.isRevoked(claims.session_id))) client.disconnect(true); } catch { client.disconnect(true); }
  }

  /** Capture state reported by a client device; relayed to the user's other devices on the same session. */
  @SubscribeMessage('audio:status')
  audio(@ConnectedSocket() c: Socket, @MessageBody() body: unknown): Ack {
    const p = audioStatusSchema.safeParse(body);
    if (!p.success || !c.rooms.has(room(p.data.sessionId))) return { ok: false, error: 'rejected' };
    c.to(room(p.data.sessionId)).emit('audio:status', p.data); return { ok: true };
  }

  @SubscribeMessage('session:join')
  async join(@ConnectedSocket() c: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const p = sessionRefSchema.safeParse(body); if (!p.success || !c.data.userId) return { ok: false, error: 'invalid' };
    try { await this.interviews.get(c.data.userId, p.data.sessionId); } catch { return { ok: false, error: 'not_found' }; }
    await c.join(room(p.data.sessionId)); return { ok: true };
  }

  @SubscribeMessage('session:leave')
  async leave(@ConnectedSocket() c: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const p = sessionRefSchema.safeParse(body); if (!p.success) return { ok: false, error: 'invalid' };
    await c.leave(room(p.data.sessionId)); return { ok: true };
  }

  @SubscribeMessage('transcript:partial')
  partial(@ConnectedSocket() c: Socket, @MessageBody() body: unknown): Ack {
    const p = transcriptPartialSchema.safeParse(body);
    if (!p.success || !c.rooms.has(room(p.data.sessionId))) return { ok: false, error: 'rejected' };
    c.to(room(p.data.sessionId)).emit('transcript:partial', p.data); // partials are ephemeral: never persisted
    return { ok: true };
  }

  @SubscribeMessage('transcript:final')
  async final(@ConnectedSocket() c: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const p = transcriptFinalSchema.safeParse(body);
    if (!p.success || !c.rooms.has(room(p.data.sessionId))) return { ok: false, error: 'rejected' };
    try {
      const { created } = await this.tx.ingest(c.data.userId, p.data);
      // Only the other party's audio (SYSTEM) can contain interviewer questions; the candidate's own speech never triggers detection.
      if (created && p.data.source === 'SYSTEM') this.detector.push(c.data.userId, p.data.sessionId, p.data.text);
      if (created) this.server.to(room(p.data.sessionId)).emit('transcript:final', p.data); // duplicates are not re-broadcast
      return { ok: true, created };
    } catch (e) { this.log.warn(`final rejected: ${(e as Error).message}`); return { ok: false, error: 'rejected' }; }
  }
}
