import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpStatus,
  INestApplication,
  ValidationPipe,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../src/users/enums/user-role.enum';
import { User } from '../src/users/user.entity';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepo: Repository<User>;
  let jwtService: JwtService;

  let userToken: string;
  let adminToken: string;
  let userId: number;

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
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    await app.init();

    dataSource = app.get(DataSource);
    userRepo = dataSource.getRepository(User);
    jwtService = app.get(JwtService);

    await userRepo.query('TRUNCATE TABLE "Users" CASCADE');

    const admin = await userRepo.save({
      email: 'admin@test.com',
      password: 'adminHashedPassword',
      role: UserRole.ADMIN,
      firstName: 'Admin',
      lastName: 'Role',
    });

    const user = await userRepo.save({
      email: 'user@test.com',
      password: 'userHashedPassword',
      role: UserRole.USER,
      firstName: 'User',
      lastName: 'Role',
    });

    adminToken = jwtService.sign({
      sub: admin.id,
      role: admin.role,
      isTwoFAuthenticated: true,
    });

    userToken = jwtService.sign({
      sub: user.id,
      role: UserRole.USER,
      isTwoFAuthenticated: true,
    });

    userId = user.id;
  });

  afterAll(async () => {
    await userRepo.query('TRUNCATE TABLE "Users" CASCADE');
    await app.close();
  });

  describe('GET /users/me', () => {
    it('should return 401 if no token is provided', async () => {
      await request(app.getHttpServer() as Server)
        .get('/users/me')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return the current user profile', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/users/me')
        .auth(userToken, { type: 'bearer' })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('id', userId);
      expect(response.body).toHaveProperty('email', 'user@test.com');
      expect(response.body).not.toHaveProperty('password');
    });
  });

  describe('GET /users', () => {
    it('should return 401 if no token is provided', async () => {
      await request(app.getHttpServer() as Server)
        .get('/users')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 if user tries to get users', async () => {
      await request(app.getHttpServer() as Server)
        .get('/users')
        .auth(userToken, { type: 'bearer' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return all users if admin token is provided', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/users')
        .auth(adminToken, { type: 'bearer' })
        .expect(HttpStatus.OK);

      const body = response.body as Array<User>;
      expect(body).toHaveLength(2);
      const emails = body.map((u: User) => u.email);
      expect(emails).toEqual([
        expect.stringContaining('admin@test.com'),
        expect.stringContaining('user@test.com'),
      ]);
    });
  });
});
