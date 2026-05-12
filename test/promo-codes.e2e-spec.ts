import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { PromoCodesService } from '../src/promo-codes/promo-codes.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { PromoCodesController } from '../src/promo-codes/promo-codes.controller';

describe('PromoCodesController (e2e)', () => {
  let app: INestApplication;

  const mockPromoCodesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PromoCodesController],
      providers: [
        {
          provide: PromoCodesService,
          useValue: mockPromoCodesService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/promocodes (POST)', () => {
    it('should return 400 for invalid data', () => {
      return request(app.getHttpServer() as Server)
        .post('/promocodes')
        .send({})
        .expect(400)
        .expect((res) => {
          const body = res.body as { message: Array<string>; error: string };
          expect(body.message).toBeInstanceOf(Array);
          expect(body.error).toBe('Bad Request');
        });
    });

    it('should return 409 for duplicate promo code', () => {
      const dto = {
        code: 'PROMO',
        maxUses: 10,
        discountPercentage: 10,
        expiresAt: new Date(),
      };

      mockPromoCodesService.create.mockRejectedValue(
        new ConflictException('Promo code already exists'),
      );

      return request(app.getHttpServer() as Server)
        .post('/promocodes')
        .send(dto)
        .expect(409)
        .expect((res) => {
          const body = res.body as { message: string; error: string };
          expect(body.message).toBe('Promo code already exists');
          expect(body.error).toBe('Conflict');
        });
    });

    it('should create a new promo code', () => {
      const dto = {
        code: 'PROMO',
        maxUses: 10,
        discountPercentage: 10,
        expiresAt: new Date(),
      };

      const createdPromo = {
        ...dto,
        expiresAt: dto.expiresAt.toISOString(),
        id: '1',
      };

      mockPromoCodesService.create.mockResolvedValue(createdPromo);

      return request(app.getHttpServer() as Server)
        .post('/promocodes')
        .send(dto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual(createdPromo);
          expect(mockPromoCodesService.create).toHaveBeenCalledWith(
            expect.objectContaining({
              code: dto.code,
              maxUses: dto.maxUses,
              discountPercentage: dto.discountPercentage,
              expiresAt: dto.expiresAt,
            }),
          );
        });
    });
  });

  describe('/promocodes (GET)', () => {
    it('should return all promo codes', () => {
      const mockPromoList = [
        { id: '1', code: 'PROMO1' },
        { id: '2', code: 'PROMO2' },
      ];

      mockPromoCodesService.findAll.mockResolvedValue(mockPromoList);

      return request(app.getHttpServer() as Server)
        .get('/promocodes')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockPromoList);
          expect(mockPromoCodesService.findAll).toHaveBeenCalled();
        });
    });
  });

  describe('/promocodes/:id (PATCH)', () => {
    const promoId = 'uuid';

    it('should return 400 when updating non-existent promo code', () => {
      mockPromoCodesService.update.mockRejectedValue(
        new BadRequestException('Promo code not found'),
      );

      return request(app.getHttpServer() as Server)
        .patch(`/promocodes/${promoId}`)
        .send({ discountPercentage: 42 })
        .expect(400);
    });

    it('should return 200 and update promo code', () => {
      const dto = { isActive: false };
      const updated = { id: promoId, code: 'TEST', isActive: false };

      mockPromoCodesService.update.mockResolvedValue(updated);

      return request(app.getHttpServer() as Server)
        .patch(`/promocodes/${promoId}`)
        .send(dto)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(updated);
          expect(mockPromoCodesService.update).toHaveBeenCalledWith(
            promoId,
            dto,
          );
        });
    });
  });
});
