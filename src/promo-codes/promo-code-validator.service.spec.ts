import { Test } from '@nestjs/testing';
import { PromoCodeValidatorService } from './promo-code-validator.service';
import { EntityManager } from 'typeorm';
import { Workspace } from 'src/workspaces/workspace.entity';
import { BadRequestException } from '@nestjs/common';
import { PC_CONDITION_ERRORS, PC_ERRORS } from './promo-code.constants';
import { PromoCode } from './promo-code.entity';

describe('PromoCodeValidatorService', () => {
  let service: PromoCodeValidatorService;
  let mockManager: Partial<EntityManager>;

  beforeEach(async () => {
    mockManager = {
      findOne: jest.fn(),
      count: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        PromoCodeValidatorService,
        { provide: EntityManager, useValue: mockManager },
      ],
    }).compile();

    service = module.get<PromoCodeValidatorService>(PromoCodeValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validatePromoCode', () => {
    const mockWorkspace = { type: 'open_space' } as Workspace;
    const startTime = new Date();

    it('should throw error if promo code is not found', async () => {
      (mockManager.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.validatePromoCode(
          'TEST',
          1,
          mockWorkspace,
          1337,
          startTime,
          mockManager as EntityManager,
        ),
      ).rejects.toThrow(new BadRequestException(PC_ERRORS.NOT_FOUND));
    });

    it('should throw error if promo code is not active', async () => {
      const inactivePromo = {
        code: 'TEST_INACTIVE',
        isActive: false,
      } as PromoCode;

      (mockManager.findOne as jest.Mock).mockResolvedValue(inactivePromo);

      await expect(
        service.validatePromoCode(
          'TEST_INACTIVE',
          1,
          mockWorkspace,
          1337,
          startTime,
          mockManager as EntityManager,
        ),
      ).rejects.toThrow(new BadRequestException(PC_ERRORS.INACTIVE));
    });

    it('should throw error if promo code is expired', async () => {
      const expiredPromo = {
        code: 'TEST_EXPIRED',
        isActive: true,
        expiresAt: new Date(Date.now() - 100000),
        remainingUses: 1,
      } as PromoCode;

      (mockManager.findOne as jest.Mock).mockResolvedValue(expiredPromo);

      await expect(
        service.validatePromoCode(
          'TEST_EXPIRED',
          1,
          mockWorkspace,
          1337,
          startTime,
          mockManager as EntityManager,
        ),
      ).rejects.toThrow(new BadRequestException(PC_ERRORS.EXPIRED));
    });

    it('should throw error if promo code has no remaining uses', async () => {
      const limitReachedPromo = {
        code: 'TEST_NO_USES',
        isActive: true,
        expiresAt: new Date(Date.now() + 100000),
        remainingUses: 0,
      } as PromoCode;

      (mockManager.findOne as jest.Mock).mockResolvedValue(limitReachedPromo);

      await expect(
        service.validatePromoCode(
          'TEST_NO_USES',
          1,
          mockWorkspace,
          1337,
          startTime,
          mockManager as EntityManager,
        ),
      ).rejects.toThrow(new BadRequestException(PC_ERRORS.LIMIT_REACHED));
    });

    it('should throw error if total price is less than minPrice condition', async () => {
      const EXPECTED_MIN_PRICE = 1500;

      const minPricePromo = {
        code: 'TEST_MIN_PRICE',
        isActive: true,
        expiresAt: new Date(Date.now() + 100000),
        remainingUses: 1,
        conditions: { minPrice: EXPECTED_MIN_PRICE },
      } as PromoCode;

      (mockManager.findOne as jest.Mock).mockResolvedValue(minPricePromo);

      await expect(
        service.validatePromoCode(
          'TEST_MIN_PRICE',
          1,
          mockWorkspace,
          1337,
          startTime,
          mockManager as EntityManager,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          `${PC_CONDITION_ERRORS.MIN_PRICE} ${EXPECTED_MIN_PRICE} UAH`,
        ),
      );
    });

    it('should throw error if promo is for first booking only and user has past bookings', async () => {
      const firstBookingPromo = {
        code: 'TEST_FIRST_BOOKING',
        isActive: true,
        expiresAt: new Date(Date.now() + 100000),
        remainingUses: 1,
        conditions: { isFirstBooking: true },
      } as PromoCode;

      (mockManager.findOne as jest.Mock).mockResolvedValue(firstBookingPromo);
      (mockManager.count as jest.Mock).mockResolvedValue(1);

      await expect(
        service.validatePromoCode(
          'TEST_FIRST_BOOKING',
          1,
          mockWorkspace,
          1337,
          startTime,
          mockManager as EntityManager,
        ),
      ).rejects.toThrow(
        new BadRequestException(PC_CONDITION_ERRORS.NOT_FOR_FIRST_BOOKING),
      );
    });

    it('should throw error if workspace type is not allowed', async () => {
      const wrongTypePromo = {
        code: 'TEST_WRONG_TYPE',
        isActive: true,
        expiresAt: new Date(Date.now() + 100000),
        remainingUses: 1,
        conditions: { allowedWorkspaceTypes: ['private_office'] },
      } as PromoCode;

      (mockManager.findOne as jest.Mock).mockResolvedValue(wrongTypePromo);

      await expect(
        service.validatePromoCode(
          'TEST_WRONG_TYPE',
          1,
          mockWorkspace,
          1337,
          startTime,
          mockManager as EntityManager,
        ),
      ).rejects.toThrow(
        new BadRequestException(PC_CONDITION_ERRORS.WRONG_WORKSPACE_TYPE),
      );
    });

    it('should throw error if promo is only for weekends and start time is a weekday', async () => {
      const weekdayDate = new Date('2026-05-07T13:37:00Z');

      const weekendPromo = {
        code: 'TEST_WEEKEND',
        isActive: true,
        expiresAt: new Date(Date.now() + 100000),
        remainingUses: 1,
        conditions: { onlyWeekends: true },
      } as PromoCode;

      (mockManager.findOne as jest.Mock).mockResolvedValue(weekendPromo);

      await expect(
        service.validatePromoCode(
          'TEST_WEEKEND',
          1,
          mockWorkspace,
          1337,
          weekdayDate,
          mockManager as EntityManager,
        ),
      ).rejects.toThrow(
        new BadRequestException(PC_CONDITION_ERRORS.ONLY_WEEKENDS),
      );
    });

    it('should return promo code if all conditions are met', async () => {
      const weekendDate = new Date('2026-05-09T12:34:00Z');

      const allConditionsPromo = {
        code: 'TEST_ALL_CONDITIONS',
        isActive: true,
        remainingUses: 1,
        conditions: {
          minPrice: 505,
          isFirstBooking: true,
          allowedWorkspaceTypes: ['open_space'],
          onlyWeekends: true,
        },
      } as PromoCode;
      (mockManager.findOne as jest.Mock).mockResolvedValue(allConditionsPromo);
      (mockManager.count as jest.Mock).mockResolvedValue(0);

      const result = await service.validatePromoCode(
        'TEST_ALL_CONDITIONS',
        1,
        mockWorkspace,
        1337,
        weekendDate,
        mockManager as EntityManager,
      );

      expect(result).toEqual(allConditionsPromo);
    });
  });
});
