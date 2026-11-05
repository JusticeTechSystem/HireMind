import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from './health.controller';

describe('GET /health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32),
      FRONTEND_URL: 'http://localhost:5173', BACKEND_URL: 'http://localhost:3000', REDIS_URL: 'redis://x',
    });
    const m = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    app = m.createNestApplication(); await app.init();
  });
  afterAll(() => app.close());
  it('reports ok and unconfigured integrations honestly', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.integrations.openai).toBe(false);
  });
});
