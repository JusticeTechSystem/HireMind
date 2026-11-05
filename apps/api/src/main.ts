import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@hiremind/config';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { Logger } from '@nestjs/common';
import { JsonLogger, reqContext } from './common/logger';
import { AllExceptionsFilter } from './common/exception.filter';

async function bootstrap() {
  const env = loadEnv(); // fails fast on invalid config
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: process.env.NODE_ENV === 'production' ? new JsonLogger() : undefined });
  const reqLog = new Logger('Request');
  if (env.SOCKET_REDIS === 'true') { const a = new RedisIoAdapter(app); await a.connect(env.REDIS_URL); app.useWebSocketAdapter(a); }
  if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
  app.getHttpAdapter().getInstance().set('trust proxy', 1); // behind a load balancer: real client IPs for rate limiting
  app.use((req: any, res: any, next: () => void) => { const id = String(req.headers['x-request-id'] ?? '').slice(0, 64) || randomUUID(); req.headers['x-request-id'] = id; res.setHeader('x-request-id', id); const t0 = Date.now();
    res.on('finish', () => { if (!String(req.originalUrl).includes('/health')) reqLog.log({ event: 'request', method: req.method, path: String(req.originalUrl).split('?')[0], status: res.statusCode, ms: Date.now() - t0 }); });
    reqContext.run({ requestId: id }, next); });
  app.useGlobalFilters(new AllExceptionsFilter(env.SENTRY_DSN ? (e) => Sentry.captureException(e) : undefined));
  app.enableShutdownHooks();
  app.use(helmet());
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
  app.setGlobalPrefix('api/v1');
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('HireMind API').setVersion('0.1').build());
  SwaggerModule.setup('api/docs', app, doc);
  await app.listen(env.PORT);
}
bootstrap();
