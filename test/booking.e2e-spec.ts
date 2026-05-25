import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { UserRole } from '../src/users/enums/user-role.enum';
import { User } from '../src/users/user.entity';
import { Booking } from '../src/bookings/entities/booking.entity';
import { StripeService } from '../src/stripe/stripe.service';
import { Workspace } from '../src/workspaces/workspace.entity';
import { WorkspaceType } from '../src/workspaces/enums/workspace-type.enum';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BookingStatus } from '../src/bookings/enums/booking-status.enum';
import { BOOKING_MESSAGES } from '../src/bookings/booking.constants';

describe('BookingsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let bookingsRepo: Repository<Booking>;
  let userRepo: Repository<User>;
  let workspaceRepo: Repository<Workspace>;
  let jwtService: JwtService;
  let cacheManager: Cache;
  let mockStripeService: Partial<StripeService>;

  let userToken: string;
  let adminToken: string;
  let userId: number;
  let redisKey: string;
  let workspaceId: number;

  beforeAll(async () => {
    mockStripeService = {
      createCheckoutSession: jest.fn().mockResolvedValue({
        id: 'sess_123',
        url: 'https://checkout.stripe.fake/c/pay/cs_test',
      }),
      expireSession: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StripeService)
      .useValue(mockStripeService)
      .compile();

    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    bookingsRepo = dataSource.getRepository(Booking);
    userRepo = dataSource.getRepository(User);
    workspaceRepo = dataSource.getRepository(Workspace);
    jwtService = app.get(JwtService);
    cacheManager = app.get(CACHE_MANAGER);

    await bookingsRepo.query('TRUNCATE TABLE "Bookings" CASCADE');
    await bookingsRepo.query('TRUNCATE TABLE "Waitlists" CASCADE');
    await userRepo.query('TRUNCATE TABLE "Users" CASCADE');
    await workspaceRepo.query('TRUNCATE TABLE "Workspaces" CASCADE');

    const user = await userRepo.save({
      email: 'user@test.com',
      password: 'userHashedPassword',
      role: UserRole.USER,
      firstName: 'User',
      lastName: 'Role',
    });

    userId = user.id;
    redisKey = `antifraud:pending_bookings:user:${userId}`;

    userToken = jwtService.sign({
      sub: userId,
      role: UserRole.USER,
      isTwoFAuthenticated: true,
    });

    adminToken = jwtService.sign({
      sub: 1337,
      role: UserRole.ADMIN,
      isTwoFAuthenticated: true,
    });

    const workspace = await workspaceRepo.save({
      title: 'Test Workspace',
      pricePerHour: 500,
      type: WorkspaceType.MEETING_ROOM,
    });

    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await bookingsRepo.query('TRUNCATE TABLE "Bookings" CASCADE');
    await bookingsRepo.query('TRUNCATE TABLE "Waitlists" CASCADE');
    await userRepo.query('TRUNCATE TABLE "Users" CASCADE');
    await workspaceRepo.query('TRUNCATE TABLE "Workspaces" CASCADE');
    await app.close();
  });

  afterEach(async () => {
    await cacheManager.del(redisKey);
  });

  describe('POST /bookings', () => {
    it('should return 401 if no token is provided', () => {
      return request(app.getHttpServer() as Server)
        .post('/bookings')
        .send({ workspaceId })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if invalid date provided', () => {
      return request(app.getHttpServer() as Server)
        .post('/bookings')
        .auth(userToken, { type: 'bearer' })
        .send({
          workspaceId,
          startTime: 'asd',
          endTime: new Date(),
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 if start >= end time', () => {
      const futureStart = new Date();
      futureStart.setDate(futureStart.getDate() + 1);
      const futureEnd = new Date(futureStart);
      futureEnd.setHours(futureStart.getHours() - 1);

      return request(app.getHttpServer() as Server)
        .post('/bookings')
        .auth(userToken, { type: 'bearer' })
        .send({
          workspaceId,
          startTime: futureStart,
          endTime: futureEnd,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 if booking in past', () => {
      const futureStart = new Date();
      futureStart.setDate(futureStart.getDate() - 1);

      return request(app.getHttpServer() as Server)
        .post('/bookings')
        .auth(userToken, { type: 'bearer' })
        .send({
          workspaceId,
          startTime: futureStart,
          endTime: new Date(),
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should block user if AntiFraudLimit is reached', async () => {
      const now = Date.now();
      await cacheManager.set(redisKey, {
        count: 3,
        expiresAt: Date.now() + 60000,
      });

      return request(app.getHttpServer() as Server)
        .post('/bookings')
        .auth(userToken, { type: 'bearer' })
        .send({
          workspaceId,
          startTime: new Date(now),
          endTime: new Date(now + 600000),
        })
        .expect(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('should create booking', async () => {
      const now = Date.now();

      const response = await request(app.getHttpServer() as Server)
        .post('/bookings')
        .auth(userToken, { type: 'bearer' })
        .send({
          workspaceId,
          startTime: new Date(now + 600000),
          endTime: new Date(now + 1200000),
        })
        .expect(HttpStatus.CREATED);

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalled();
      const body = response.body as {
        message: string;
        data: { bookingId: string; paymentUrl: string };
      };
      expect(body.data).toHaveProperty(
        'paymentUrl',
        'https://checkout.stripe.fake/c/pay/cs_test',
      );
      const booking = await bookingsRepo.findOne({
        where: { id: body.data.bookingId },
      });
      expect(booking).toBeDefined();
    });

    it('should return 409 if workspace is already booked at this time', async () => {
      const now = Date.now();

      await bookingsRepo.save({
        workspaceId,
        userId,
        startTime: new Date(now + 600000),
        endTime: new Date(now + 1200000),
        price: 500,
        status: BookingStatus.CONFIRMED,
      });

      return request(app.getHttpServer() as Server)
        .post('/bookings')
        .auth(userToken, { type: 'bearer' })
        .send({
          workspaceId,
          startTime: new Date(now + 700000),
          endTime: new Date(now + 1300000),
        })
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('POST /bookings/:id/cancel', () => {
    let bookingToCancelId: string;

    beforeAll(async () => {
      const booking = await bookingsRepo.findOne({
        where: { user: { id: userId } },
      });
      bookingToCancelId = booking!.id;
    });

    it('should return 401 if no token provided', () => {
      return request(app.getHttpServer() as Server)
        .post(`/bookings/${bookingToCancelId}/cancel`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 if booking not found', () => {
      const bookingId = '550e8400-e29b-41d4-a716-446655440000';

      return request(app.getHttpServer() as Server)
        .post(`/bookings/${bookingId}/cancel`)
        .auth(userToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should cancel booking successfully', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post(`/bookings/${bookingToCancelId}/cancel`)
        .auth(userToken, { type: 'bearer' })
        .expect(HttpStatus.OK);

      const body = response.body as {
        message: string;
        data: object;
      };
      expect(body.message).toBe(BOOKING_MESSAGES.CANCELLED_SUCCESS);

      const booking = await bookingsRepo.findOne({
        where: { id: bookingToCancelId },
      });
      expect(booking?.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('POST /bookings/waitlist', () => {
    it('should return 401 if no token provided', () => {
      return request(app.getHttpServer() as Server)
        .post(`/bookings/waitlist`)
        .send({ workspaceId })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if invalid date provided', () => {
      return request(app.getHttpServer() as Server)
        .post(`/bookings/waitlist`)
        .auth(userToken, { type: 'bearer' })
        .send({ workspaceId, startTime: 'asd', endTime: new Date() })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should join waitlist successfully', async () => {
      const futureStart = new Date();
      futureStart.setDate(futureStart.getDate() + 4);
      const futureEnd = new Date(futureStart);
      futureEnd.setHours(futureStart.getHours() + 1);

      const response = await request(app.getHttpServer() as Server)
        .post('/bookings/waitlist')
        .auth(userToken, { type: 'bearer' })
        .send({
          workspaceId,
          startTime: futureStart,
          endTime: futureEnd,
        })
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty(
        'message',
        BOOKING_MESSAGES.WAITLISTED_SUCCESS,
      );
    });
  });

  describe('DELETE /bookings/:id', () => {
    let bookingId: string;

    beforeAll(async () => {
      const booking = await bookingsRepo.findOne({
        where: { user: { id: userId } },
      });
      bookingId = booking!.id;
    });

    it('should return 401 when not authenticated', async () => {
      await request(app.getHttpServer() as Server)
        .delete(`/bookings/${bookingId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 when not authorized', async () => {
      await request(app.getHttpServer() as Server)
        .delete(`/bookings/${bookingId}`)
        .auth(userToken, { type: 'bearer' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 404 when booking does not exist', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app.getHttpServer() as Server)
        .delete(`/bookings/${nonExistentId}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should soft delete booking when authorized', async () => {
      await request(app.getHttpServer() as Server)
        .delete(`/bookings/${bookingId}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(HttpStatus.OK);

      const dbBooking = await bookingsRepo.findOne({
        where: { id: bookingId },
        withDeleted: true,
      });
      expect(dbBooking).toBeDefined();
      expect(dbBooking?.deletedAt).not.toBeNull();
    });
  });
});
