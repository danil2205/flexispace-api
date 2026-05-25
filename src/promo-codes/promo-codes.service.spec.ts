import { Test } from '@nestjs/testing';
import { PromoCodesService } from './promo-codes.service';
import { EntityManager, Repository } from 'typeorm';
import { PromoCode } from './promo-code.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('PromoCodesService', () => {
  let service: PromoCodesService;
  let mockPromoCodeRepository: Partial<Repository<PromoCode>>;

  beforeEach(async () => {
    mockPromoCodeRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      softDelete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        PromoCodesService,
        {
          provide: getRepositoryToken(PromoCode),
          useValue: mockPromoCodeRepository,
        },
      ],
    }).compile();

    service = module.get<PromoCodesService>(PromoCodesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw error if promo code already exists', async () => {
      const promoCodeExists: PromoCode = {
        id: '1',
        code: 'Test',
      } as PromoCode;

      const promoCodeToCreate = {
        code: 'Test',
        discountPercentage: 10,
        maxUses: 10,
        remainingUses: 10,
      };

      (mockPromoCodeRepository.findOne as jest.Mock).mockResolvedValue(
        promoCodeExists,
      );

      await expect(service.create(promoCodeToCreate)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should successfully create promo code and save it', async () => {
      const promoCodeToCreate = {
        code: 'TEST',
        discountPercentage: 10,
        maxUses: 10,
      };

      const savedPromo = {
        id: 1,
        ...promoCodeToCreate,
        remainingUses: 1,
      };

      (mockPromoCodeRepository.save as jest.Mock).mockResolvedValue(savedPromo);
      const result = await service.create(promoCodeToCreate);

      expect(mockPromoCodeRepository.create).toHaveBeenCalledWith(
        promoCodeToCreate,
      );
      expect(mockPromoCodeRepository.save).toHaveBeenCalled();
      expect(result).toEqual(savedPromo);
    });
  });

  describe('findAll', () => {
    it('should return all promo codes sorted by createdAt descending', async () => {
      const promoCodes = [
        { id: '1', code: 'PROMO1' },
        { id: '2', code: 'PROMO2' },
      ];
      (mockPromoCodeRepository.find as jest.Mock).mockResolvedValue(promoCodes);

      const result = await service.findAll();

      expect(mockPromoCodeRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(promoCodes);
    });
  });

  describe('update', () => {
    it('should throw BadRequestException if promo code not found', async () => {
      (mockPromoCodeRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.update('1', { code: 'NEW' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update promo code successfully', async () => {
      const existingPromo = {
        id: '1',
        code: 'OLD',
        maxUses: 5,
        remainingUses: 5,
        isActive: true,
        discountPercentage: 10,
        expiresAt: null,
        conditions: null,
      };

      const dto = {
        code: 'NEW',
        maxUses: 10,
        conditions: { isFirstBooking: true },
      };

      (mockPromoCodeRepository.findOne as jest.Mock).mockResolvedValue(
        existingPromo,
      );
      (mockPromoCodeRepository.save as jest.Mock).mockResolvedValue({
        ...existingPromo,
        ...dto,
      });

      const result = await service.update('1', dto);

      expect(existingPromo.code).toBe('NEW');
      expect(existingPromo.maxUses).toBe(10);
      expect(existingPromo.conditions).toEqual({ isFirstBooking: true });
      expect(mockPromoCodeRepository.save).toHaveBeenCalledWith(existingPromo);
      expect(result.code).toBe('NEW');
    });
  });

  describe('changeUses', () => {
    it('should decrement remaining uses inside a transaction', async () => {
      const updateMock = jest
        .fn<
          Promise<{ affected: number }>,
          [typeof PromoCode, string, { remainingUses: () => string }]
        >()
        .mockResolvedValue({ affected: 1 });

      const mockManager = {
        update: updateMock,
      } as unknown as EntityManager;

      const change = -1;
      const promoId = '1';
      await service.changeUses(mockManager, promoId, change);

      expect(updateMock).toHaveBeenCalledTimes(1);

      const [target, id, payload] = updateMock.mock.calls[0];
      expect(target).toBe(PromoCode);
      expect(id).toBe(promoId);
      expect(payload.remainingUses()).toEqual(`remainingUses + ${change}`);
    });
  });

  describe('delete', () => {
    it('should throw BadRequestException if promo code not found', async () => {
      (mockPromoCodeRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.delete('1')).rejects.toThrow(BadRequestException);
      expect(mockPromoCodeRepository.softDelete).not.toHaveBeenCalled();
    });

    it('should soft delete promo code successfully if found', async () => {
      const existingPromo = { id: '1', code: 'PROMO' };
      (mockPromoCodeRepository.findOne as jest.Mock).mockResolvedValue(
        existingPromo,
      );
      (mockPromoCodeRepository.softDelete as jest.Mock).mockResolvedValue({
        affected: 1,
      });

      await service.delete('1');

      expect(mockPromoCodeRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
      expect(mockPromoCodeRepository.softDelete).toHaveBeenCalledWith('1');
    });
  });
});
