import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 and health status ok if everything is up', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/health')
        .expect(HttpStatus.OK);

      const body = response.body as {
        status: string;
        info: Record<
          'database' | 'storage' | 'memory_heap' | 'redis',
          { status: string }
        >;
      };
      expect(body.status).toBe('ok');
      expect(body.info.database.status).toBe('up');
      expect(body.info.storage.status).toBe('up');
      expect(body.info.memory_heap.status).toBe('up');
      expect(body.info.redis.status).toBe('up');
    });
  });
});
