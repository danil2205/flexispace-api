import { Test, TestingModule } from '@nestjs/testing';
import {
  ClassSerializerInterceptor,
  HttpStatus,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { DataSource, Repository } from 'typeorm';
import { User } from '../src/users/user.entity';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from '../src/auth/auth.service';
import { GoogleAuthGuard } from '../src/auth/guards/google-auth.guard';

import { Reflector } from '@nestjs/core';
import { LOGGED_OUT_MESSAGE } from '../src/auth/auth.constants';
import { GoogleUser } from '../src/auth/interfaces/google-user.interface';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepo: Repository<User>;
  let authService: AuthService;

  const testUser = {
    email: 'auth_user@test.com',
    password: 'StrongPass123!',
    firstName: 'User',
    lastName: 'Role',
  };

  let userRefreshToken: string;
  let userAccessToken: string;
  let userId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);
    jest
      .spyOn(GoogleAuthGuard.prototype, 'canActivate')
      .mockImplementation((context) => {
        const req = context.switchToHttp().getRequest<{ user: GoogleUser }>();
        req.user = {
          email: 'google_user@test.com',
          firstName: 'Google',
          lastName: 'User',
          googleId: 'google123456',
        };
        return true;
      });

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    await app.init();

    dataSource = app.get(DataSource);
    userRepo = dataSource.getRepository(User);
    authService = app.get(AuthService);

    await userRepo.query('TRUNCATE TABLE "Users" CASCADE');
  });

  afterAll(async () => {
    await userRepo.query('TRUNCATE TABLE "Users" CASCADE');
    await app.close();
  });

  describe('POST /auth/sign-up', () => {
    it('should return 400 if validation fails', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/sign-up')
        .send({ ...testUser, email: 'usertest.com' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should create a new user', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/auth/sign-up')
        .send(testUser)
        .expect(HttpStatus.CREATED);

      const body = response.body as User;
      expect(body.email).toBe(testUser.email);
      expect(body.password).toBeUndefined();
      userId = body.id;
    });

    it('should return 409 if email already exists', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/sign-up')
        .send(testUser)
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('POST /auth/sign-in', () => {
    it('should sign in user and return tokens', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/auth/sign-in')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(HttpStatus.OK);

      const body = response.body as {
        accessToken: string;
        refreshToken: string;
      };
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      userRefreshToken = body.refreshToken;
    });

    it('should return 401 if invalid credentials', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/sign-in')
        .send({
          email: testUser.email,
          password: 'invalidPassword',
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /auth/refresh-tokens', () => {
    it('return 403 for expired refresh token', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/refresh-tokens')
        .send({
          refreshToken: 'invalidRefreshToken',
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return new tokens', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await request(app.getHttpServer() as Server)
        .post('/auth/refresh-tokens')
        .send({
          refreshToken: userRefreshToken,
        })
        .expect(HttpStatus.OK);

      const body = response.body as {
        accessToken: string;
        refreshToken: string;
      };

      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      userAccessToken = body.accessToken;
    });

    it('should return 401 for invalid token', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/refresh-tokens')
        .send({
          refreshToken: userRefreshToken,
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /auth/2fa/generate', () => {
    it('should return 401 if no token provided', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/2fa/generate')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should generate QR code', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/auth/2fa/generate')
        .auth(userAccessToken, { type: 'bearer' })
        .expect(HttpStatus.OK);

      expect(response.text).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('POST /auth/2fa/turn-on', () => {
    it('should return 401 for invalid 2FA code', () => {
      return request(app.getHttpServer() as Server)
        .post('/auth/2fa/turn-on')
        .auth(userAccessToken, { type: 'bearer' })
        .send({ tfaCode: '000000' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should turn on 2FA', async () => {
      jest.spyOn(authService, 'isTfaCodeValid').mockResolvedValueOnce(true);

      const response = await request(app.getHttpServer() as Server)
        .post('/auth/2fa/turn-on')
        .auth(userAccessToken, { type: 'bearer' })
        .send({ tfaCode: '123456' })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty(
        'message',
        '2FA turned on successfully',
      );

      const updatedUser = await userRepo.findOne({
        where: { id: userId },
      });
      expect(updatedUser?.isTwoFAEnabled).toBe(true);
    });
  });

  describe('POST /auth/2fa/authenticate', () => {
    it('should authenticate 2FA successfully', async () => {
      jest.spyOn(authService, 'isTfaCodeValid').mockResolvedValueOnce(true);

      const response = await request(app.getHttpServer() as Server)
        .post('/auth/2fa/authenticate')
        .auth(userAccessToken, { type: 'bearer' })
        .send({ tfaCode: '123456' })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('requires2FA', false);
    });
  });

  describe('POST /auth/2fa/turn-off', () => {
    it('should successfully turn off 2FA if code is valid', async () => {
      jest.spyOn(authService, 'isTfaCodeValid').mockResolvedValueOnce(true);

      const response = await request(app.getHttpServer() as Server)
        .post('/auth/2fa/turn-off')
        .auth(userAccessToken, { type: 'bearer' })
        .send({ tfaCode: '123456' })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty(
        'message',
        '2FA turned off successfully',
      );

      const updatedUser = await userRepo.findOne({
        where: { id: userId },
      });
      expect(updatedUser?.isTwoFAEnabled).toBe(false);
      expect(updatedUser?.twoFASecret).toBeNull();
    });
  });

  describe('POST /auth/logout', () => {
    it('should successfully log out user and clear stored refresh token', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/auth/logout')
        .auth(userAccessToken, { type: 'bearer' })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('message', LOGGED_OUT_MESSAGE);

      const updatedUser = await userRepo.findOne({
        where: { id: userId },
        select: ['id', 'refreshToken'],
      });
      expect(updatedUser?.refreshToken).toBeNull();
    });
  });

  describe('GET /auth/google', () => {
    it('should handle google oauth initiation', () => {
      return request(app.getHttpServer() as Server)
        .get('/auth/google')
        .expect(HttpStatus.OK);
    });
  });

  describe('GET /auth/google/callback', () => {
    it('should handle google login and set cookies', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/auth/google/callback')
        .expect(HttpStatus.FOUND);

      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers.location).toContain(
        'http://localhost:3500/login/success',
      );
    });
  });
});
