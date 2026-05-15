import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../src/users/enums/user-role.enum';
import { S3Service } from '../src/files/s3/s3.service';

describe('FilesController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let userToken: string;

  const mockS3Service = {
    uploadFile: jest.fn().mockResolvedValue('mocked-url'),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(S3Service)
      .useValue(mockS3Service)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = app.get(JwtService);

    userToken = jwtService.sign({
      sub: 1,
      role: UserRole.USER,
      isTwoFAuthenticated: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /files/upload', () => {
    it('should return 401 if no token is provided', () => {
      return request(app.getHttpServer() as Server)
        .post('/files/upload')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 400 if no file is provided', () => {
      return request(app.getHttpServer() as Server)
        .post('/files/upload')
        .auth(userToken, { type: 'bearer' })
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          expect(res.body).toHaveProperty('message', 'File is required');
        });
    });

    it('should decline file with incorrect type', () => {
      const file = Buffer.from('test');

      return request(app.getHttpServer() as Server)
        .post('/files/upload')
        .auth(userToken, { type: 'bearer' })
        .attach('file', file, 'test.pdf')
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: string };
          expect(body.message).toContain('Validation failed');
        });
    });

    it('should decline file with size larger than 5MB', () => {
      const file = Buffer.alloc(1024 * 1024 * 6);

      return request(app.getHttpServer() as Server)
        .post('/files/upload')
        .auth(userToken, { type: 'bearer' })
        .attach('file', file, 'large.png')
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: string };
          expect(body.message).toContain('Validation failed');
        });
    });

    it('should return 201 and url if file is valid', async () => {
      const file = Buffer.from('test');

      const response = await request(app.getHttpServer() as Server)
        .post('/files/upload')
        .auth(userToken, { type: 'bearer' })
        .attach('file', file, 'file.jpg')
        .expect(HttpStatus.CREATED);

      expect(mockS3Service.uploadFile).toHaveBeenCalled();

      expect(response.body).toEqual({
        imageUrl: 'mocked-url',
      });
    });
  });
});
