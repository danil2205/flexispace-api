import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { DataSource, Repository } from 'typeorm';
import { Workspace } from '../src/workspaces/workspace.entity';
import { Booking } from '../src/bookings/entities/booking.entity';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../src/users/enums/user-role.enum';
import { WorkspaceType } from '../src/workspaces/enums/workspace-type.enum';
import {
  INVALID_DATE_RANGE_ERROR,
  PAST_TIME_ERROR,
} from '../src/workspaces/workspaces.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventSource } from 'eventsource';

describe('WorkspacesController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let workspaceRepo: Repository<Workspace>;
  let bookingRepo: Repository<Booking>;
  let jwtService: JwtService;
  let eventEmitter: EventEmitter2;
  let url: string;

  let adminToken: string;
  let userToken: string;
  let savedWorkspaces: Workspace[];

  const ONE_HOUR_MS = 3600000;
  const TWO_HOUR_MS = 7200000;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    await app.listen(0);
    url = await app.getUrl();

    dataSource = app.get(DataSource);
    workspaceRepo = dataSource.getRepository(Workspace);
    bookingRepo = dataSource.getRepository(Booking);
    jwtService = app.get(JwtService);
    eventEmitter = app.get(EventEmitter2);

    adminToken = jwtService.sign({
      sub: 1,
      role: UserRole.ADMIN,
      isTwoFAuthenticated: true,
    });

    userToken = jwtService.sign({
      sub: 2,
      role: UserRole.USER,
      isTwoFAuthenticated: true,
    });
  });

  afterAll(async () => {
    await bookingRepo.query('TRUNCATE TABLE "Bookings" CASCADE');
    await workspaceRepo.query('TRUNCATE TABLE "Workspaces" CASCADE');
    await app.close();
  });

  describe('GET /workspaces', () => {
    beforeAll(async () => {
      savedWorkspaces = await workspaceRepo.save([
        {
          title: 'Cheap Room',
          pricePerHour: 100,
          capacity: 2,
          type: WorkspaceType.OPEN_SPACE,
        },
        {
          title: 'Expensive Room',
          pricePerHour: 1000,
          capacity: 5,
          type: WorkspaceType.PRIVATE_OFFICE,
        },
        {
          title: 'Big Room',
          pricePerHour: 300,
          capacity: 20,
          type: WorkspaceType.OPEN_SPACE,
        },
      ]);
    });

    it('should return 400 for invalid query params', () => {
      return request(app.getHttpServer() as Server)
        .get('/workspaces')
        .query({ minPrice: 'asd' })
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: Array<string>; error: string };
          expect(body.message).toBeInstanceOf(Array);
          expect(body.error).toBe('Bad Request');
        });
    });

    it('should filter workspaces by minPrice and type', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/workspaces')
        .query({ minPrice: 200, type: WorkspaceType.OPEN_SPACE })
        .expect(HttpStatus.OK);

      const body = response.body as {
        data: Array<Workspace>;
        meta: Record<string, number>;
      };
      expect(body.data).toHaveLength(1);

      expect(body.data[0]).toEqual(
        expect.objectContaining({
          title: 'Big Room',
          pricePerHour: 300,
          capacity: 20,
          type: WorkspaceType.OPEN_SPACE,
        }),
      );
      expect(body.meta.totalItems).toBe(1);
    });

    it('should paginate query results', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/workspaces')
        .query({ limit: 2, page: 2 })
        .expect(HttpStatus.OK);

      const body = response.body as {
        data: Array<Workspace>;
        meta: Record<string, number>;
      };
      expect(body.data).toHaveLength(1);
      expect(body.meta.totalItems).toBe(3);
    });
  });

  describe('GET /workspaces/:id', () => {
    it('should return 404 when workspace with given id does not exist', async () => {
      return request(app.getHttpServer() as Server)
        .get('/workspaces/999999')
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid id format', async () => {
      return request(app.getHttpServer() as Server)
        .get('/workspaces/asd')
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: string; error: string };
          expect(body.message).toBe(
            'Validation failed (numeric string is expected)',
          );
          expect(body.error).toBe('Bad Request');
        });
    });

    it('should return workspace with given id', async () => {
      const cheapRoom = savedWorkspaces[0];
      const response = await request(app.getHttpServer() as Server)
        .get(`/workspaces/${cheapRoom.id}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: cheapRoom.id,
          title: 'Cheap Room',
          pricePerHour: 100,
          capacity: 2,
          type: WorkspaceType.OPEN_SPACE,
        }),
      );
    });
  });

  describe('GET /workspaces/available', () => {
    const testStartTime = new Date(Date.now() + 86400000);
    const testEndTime = new Date(Date.now() + 90000000);

    beforeAll(async () => {
      await bookingRepo.save({
        workspace: { id: savedWorkspaces[0].id },
        startTime: testStartTime,
        endTime: testEndTime,
        price: 100,
      });
    });

    it('should return 400 for invalid date range', async () => {
      const now = new Date();
      return request(app.getHttpServer() as Server)
        .get('/workspaces/available')
        .query({
          startTime: now,
          endTime: new Date(now.getTime() - 10000),
        })
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: string };
          expect(body.message).toBe(INVALID_DATE_RANGE_ERROR);
        });
    });

    it('should return 400 for past start time', async () => {
      const now = new Date();
      return request(app.getHttpServer() as Server)
        .get('/workspaces/available')
        .query({
          startTime: new Date(now.getTime() - 10000),
          endTime: now,
        })
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: string };
          expect(body.message).toBe(PAST_TIME_ERROR);
        });
    });

    it('should return 400 for invalid query parameters', async () => {
      return request(app.getHttpServer() as Server)
        .get('/workspaces/available')
        .query({
          startTime: 'abc',
        })
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: Array<string>; error: string };
          expect(body.message).toBeInstanceOf(Array);
          expect(body.error).toBe('Bad Request');
        });
    });

    it('should not return workspace with overlapping booking', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/workspaces/available')
        .query({
          startTime: testStartTime,
          endTime: testEndTime,
        })
        .expect(HttpStatus.OK);

      const body = response.body as { data: Array<Workspace> };
      expect(body.data).toHaveLength(2);
    });

    it('should return available workspaces', async () => {
      const now = new Date();
      const response = await request(app.getHttpServer() as Server)
        .get('/workspaces/available')
        .query({
          startTime: new Date(now.getTime() + ONE_HOUR_MS),
          endTime: new Date(now.getTime() + TWO_HOUR_MS),
        })
        .expect(HttpStatus.OK);

      const body = response.body as { data: Array<Workspace> };
      expect(body.data).toHaveLength(3);
    });
  });

  describe('POST /workspaces', () => {
    const workspaceDto = {
      title: 'New Workspace',
      description: 'Description',
      pricePerHour: 100,
      capacity: 10,
      type: WorkspaceType.OPEN_SPACE,
    };

    it('should return 401 when not authenticated', async () => {
      return request(app.getHttpServer() as Server)
        .post('/workspaces')
        .send(workspaceDto)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 when not authorized', async () => {
      return request(app.getHttpServer() as Server)
        .post('/workspaces')
        .auth(userToken, { type: 'bearer' })
        .send(workspaceDto)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 400 for invalid workspace body', async () => {
      return request(app.getHttpServer() as Server)
        .post('/workspaces')
        .auth(adminToken, { type: 'bearer' })
        .send({
          ...workspaceDto,
          pricePerHour: 'abc',
        })
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: Array<string>; error: string };
          expect(body.message).toBeInstanceOf(Array);
          expect(body.error).toBe('Bad Request');
        });
    });

    it('should create workspace', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/workspaces')
        .auth(adminToken, { type: 'bearer' })
        .send(workspaceDto)
        .expect(HttpStatus.CREATED);

      const body = response.body as Workspace;
      expect(body).toEqual(
        expect.objectContaining({
          title: 'New Workspace',
          pricePerHour: 100,
          capacity: 10,
          type: WorkspaceType.OPEN_SPACE,
        }),
      );

      const savedWorkspace = await workspaceRepo.findOne({
        where: { id: body.id },
      });
      expect(savedWorkspace).toBeDefined();
      expect(savedWorkspace!.capacity).toBe(10);
    });
  });

  describe('SSE /workspaces/live-updates', () => {
    it('should return event stream', async () => {
      const mockEventPayload = {
        event: 'workspace_locked',
        workspaceId: 99,
        startTime: new Date(),
        endTime: new Date(),
      };

      const eventPromise = new Promise((resolve, reject) => {
        const es = new EventSource(`${url}/workspaces/live-updates`);

        es.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data as string) as {
              workspaceId: number;
              event: string;
            };
            expect(data.workspaceId).toBe(mockEventPayload.workspaceId);
            expect(data.event).toBe(mockEventPayload.event);

            es.close();
            resolve(true);
          } catch (error) {
            es.close();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };

        es.onerror = () => {
          es.close();
          reject(new Error('EventSource connection failed'));
        };
      });

      setTimeout(() => {
        eventEmitter.emit('workspace.updated', mockEventPayload);
      }, 100);

      await eventPromise;
    });
  });
});
