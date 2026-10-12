import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { DataSource, Repository } from 'typeorm';
import { PromoCode } from '../src/promo-codes/promo-code.entity';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../src/users/enums/user-role.enum';
import { PC_ERRORS } from '../src/promo-codes/promo-code.constants';
import { CreatePromoCodeDto } from '../src/promo-codes/dtos/create-promo-code.dto';

describe('PromoCodesController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let promoCodeRepo: Repository<PromoCode>;
  let jwtService: JwtService;

  let userToken: string;
  let adminToken: string;
  let savedPromoCodes: PromoCode[];

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
    promoCodeRepo = dataSource.getRepository(PromoCode);
    jwtService = app.get(JwtService);

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
    await promoCodeRepo.query('TRUNCATE TABLE "PromoCodes" CASCADE');
    await app.close();
  });

  describe('/promo-codes (GET)', () => {
    beforeAll(async () => {
      savedPromoCodes = await promoCodeRepo.save([
        {
          code: 'PROMO',
          maxUses: 10,
          discountPercentage: 10,
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          code: 'PROMO2',
          maxUses: 10,
          discountPercentage: 20,
          expiresAt: new Date(Date.now() + 86400000),
        },
      ]);
    });

    it('should return all promo codes', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/promo-codes')
        .auth(adminToken, { type: 'bearer' })
        .expect(HttpStatus.OK);

      const body = response.body as PromoCode[];
      expect(body).toHaveLength(savedPromoCodes.length);
      const codes = body.map((p) => p.code);
      expect(codes).toEqual(
        expect.arrayContaining(savedPromoCodes.map((p) => p.code)),
      );
    });
  });

  describe('POST /promo-codes', () => {
    let createDto: CreatePromoCodeDto;

    beforeAll(() => {
      createDto = {
        code: `PROMO${savedPromoCodes.length + 1}`,
        maxUses: 10,
        discountPercentage: 10,
        expiresAt: new Date(Date.now() + 86400000),
      };
    });

    it('should return 401 Unauthorized if no token is provided', () => {
      return request(app.getHttpServer() as Server)
        .post('/promo-codes')
        .send(createDto)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 Forbidden for user', () => {
      return request(app.getHttpServer() as Server)
        .post('/promo-codes')
        .auth(userToken, { type: 'bearer' })
        .send(createDto)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 400 for invalid data', () => {
      return request(app.getHttpServer() as Server)
        .post('/promo-codes')
        .auth(adminToken, { type: 'bearer' })
        .send({})
        .expect(HttpStatus.BAD_REQUEST)
        .expect((res) => {
          const body = res.body as { message: Array<string>; error: string };
          expect(body.message).toBeInstanceOf(Array);
          expect(body.error).toBe('Bad Request');
        });
    });

    it('should return 409 for duplicate promo code', () => {
      return request(app.getHttpServer() as Server)
        .post('/promo-codes')
        .auth(adminToken, { type: 'bearer' })
        .send({ ...createDto, code: 'PROMO' })
        .expect(HttpStatus.CONFLICT)
        .expect((res) => {
          const body = res.body as { message: string; error: string };
          expect(body.message).toBe(PC_ERRORS.ALREADY_EXISTS);
          expect(body.error).toBe('Conflict');
        });
    });

    it('should create a new promo code', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/promo-codes')
        .auth(adminToken, { type: 'bearer' })
        .send(createDto)
        .expect(HttpStatus.CREATED);

      const body = response.body as PromoCode;
      expect(body).toEqual(
        expect.objectContaining({
          code: createDto.code,
          maxUses: createDto.maxUses,
          discountPercentage: createDto.discountPercentage,
          expiresAt: createDto.expiresAt?.toISOString(),
        }),
      );

      const savedPromo = await promoCodeRepo.findOne({
        where: { id: body.id },
      });

      expect(savedPromo).toBeDefined();
      expect(savedPromo!.discountPercentage).toBe(createDto.discountPercentage);
      expect(savedPromo!.isActive).toBe(true);
    });
  });

  describe('/promo-codes/:id (PATCH)', () => {
    let promoId: string;

    beforeAll(() => {
      promoId = savedPromoCodes[0].id;
    });

    it('should return 404 when updating non-existent promo code', () => {
      const nonExistentIdV4 = '635955f4-6fc1-4eec-b98b-987823f6e91f';
      return request(app.getHttpServer() as Server)
        .patch(`/promo-codes/${nonExistentIdV4}`)
        .auth(adminToken, { type: 'bearer' })
        .send({ discountPercentage: 42 })
        .expect(HttpStatus.NOT_FOUND)
        .expect((res) => {
          const body = res.body as { message: string; error: string };
          expect(body.message).toBe(PC_ERRORS.NOT_FOUND);
          expect(body.error).toBe('Not Found');
        });
    });

    it('should return 200 and update promo code', async () => {
      const dto = {
        isActive: false,
        discountPercentage: 42,
        conditions: { onlyWeekends: true },
      };

      const response = await request(app.getHttpServer() as Server)
        .patch(`/promo-codes/${promoId}`)
        .auth(adminToken, { type: 'bearer' })
        .send(dto)
        .expect(HttpStatus.OK);

      const body = response.body as PromoCode;
      expect(body.isActive).toBe(dto.isActive);
      expect(body.discountPercentage).toBe(dto.discountPercentage);
      expect(body.conditions).toEqual(dto.conditions);

      const updatedPromo = await promoCodeRepo.findOne({
        where: { id: promoId },
      });

      expect(updatedPromo).toBeDefined();
      expect(updatedPromo!.isActive).toBe(dto.isActive);
      expect(updatedPromo!.discountPercentage).toBe(dto.discountPercentage);
      expect(updatedPromo!.conditions).toEqual(dto.conditions);
    });
  });

  describe('/promo-codes/:id (DELETE)', () => {
    let promoId: string;

    beforeAll(() => {
      promoId = savedPromoCodes[0].id;
    });

    it('should return 401 when not authenticated', async () => {
      await request(app.getHttpServer() as Server)
        .delete(`/promo-codes/${promoId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 when not authorized', async () => {
      await request(app.getHttpServer() as Server)
        .delete(`/promo-codes/${promoId}`)
        .auth(userToken, { type: 'bearer' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 404 when promo code does not exist', async () => {
      const nonExistentIdV4 = '635955f4-6fc1-4eec-b98b-987823f6e91f';
      await request(app.getHttpServer() as Server)
        .delete(`/promo-codes/${nonExistentIdV4}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should soft delete promo code when authorized', async () => {
      await request(app.getHttpServer() as Server)
        .delete(`/promo-codes/${promoId}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(HttpStatus.NO_CONTENT);

      const getResponse = await request(app.getHttpServer() as Server)
        .get('/promo-codes')
        .auth(adminToken, { type: 'bearer' })
        .expect(HttpStatus.OK);

      const body = getResponse.body as Array<PromoCode>;
      expect(body.find((p) => p.id === promoId)).toBeUndefined();

      const dbPromo = await promoCodeRepo.findOne({
        where: { id: promoId },
        withDeleted: true,
      });
      expect(dbPromo).toBeDefined();
      expect(dbPromo?.deletedAt).not.toBeNull();
    });
  });
});
