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
import Response from 'superagent/lib/node/response';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('WorkspacesController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let workspaceRepo: Repository<Workspace>;
  let bookingRepo: Repository<Booking>;
  let jwtService: JwtService;
  let eventEmitter: EventEmitter2;

  let adminToken: string;
  let userToken: string;

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
    await bookingRepo.query('TRUNCATE TABLE bookings CASCADE');
    await workspaceRepo.query('TRUNCATE TABLE workspaces CASCADE');
    await app.close();
  });

  describe('GET /workspaces', () => {
    beforeAll(async () => {
      await workspaceRepo.save([
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

      const body = response.body as { data: Array<Workspace>; total: number };
      expect(body.data).toHaveLength(1);

      expect(body.data[0]).toEqual(
        expect.objectContaining({
          title: 'Big Room',
          pricePerHour: 300,
          capacity: 20,
          type: WorkspaceType.OPEN_SPACE,
        }),
      );
      expect(body.total).toBe(1);
    });

    it('should paginate query results', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/workspaces')
        .query({ limit: 2, page: 2 })
        .expect(HttpStatus.OK);

      const body = response.body as { data: Array<Workspace>; total: number };
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(3);
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
      const response = await request(app.getHttpServer() as Server)
        .get('/workspaces/1')
        .expect(HttpStatus.OK);

      const body = response.body as { data: Workspace };
      expect(body.data).toEqual(
        expect.objectContaining({
          id: 1,
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
        userId: 1,
        workspaceId: 1,
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
          startTime: now.toISOString(),
          endTime: new Date(now.getTime() - 10000).toISOString(),
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
          startTime: new Date(now.getTime() - 10000).toISOString(),
          endTime: now.toISOString(),
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
          startTime: testStartTime.toISOString(),
          endTime: testEndTime.toISOString(),
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
          startTime: now.toISOString(),
          endTime: new Date(now.getTime() + 10000).toISOString(),
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

      const body = response.body as { data: Workspace };
      expect(body.data).toEqual(
        expect.objectContaining({
          title: 'New Workspace',
          pricePerHour: 100,
          capacity: 10,
          type: WorkspaceType.OPEN_SPACE,
        }),
      );

      const savedWorkspace = await workspaceRepo.findOne({
        where: { id: body.data.id },
      });
      expect(savedWorkspace).toBeDefined();
      expect(savedWorkspace!.capacity).toBe(10);
    });
  });

  describe('SSE /workspaces/live-updates', () => {
    it('should return event stream', (done) => {
      const mockEventPayload = {
        event: 'workspace_locked',
        workspaceId: 99,
        startTime: new Date(),
        endTime: new Date(),
      };

      let resolved = false;

      const req = request(app.getHttpServer() as Server).get(
        '/workspaces/live-updates',
      );

      req
        .expect(HttpStatus.OK)
        .expect('Content-Type', 'text/event-stream')
        .buffer(false)
        .parse((res: Response) => {
          res.on('data', (chunk: Buffer) => {
            const message = chunk.toString();

            if (message.includes(mockEventPayload.event)) {
              try {
                expect(message).toContain(
                  `"workspaceId":${mockEventPayload.workspaceId}`,
                );
                expect(message).toContain(
                  `"event":"${mockEventPayload.event}"`,
                );

                resolved = true;
                req.abort();
                done();
              } catch (error) {
                resolved = true;
                req.abort();
                done(error);
              }
            }
          });
        })
        .end((err) => {
          if (!resolved && err) done(err);
        });

      setTimeout(() => {
        eventEmitter.emit('workspace.updated', mockEventPayload);
      }, 100);
    });
  });
});
