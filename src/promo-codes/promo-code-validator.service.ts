import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PromoCode } from './promo-code.entity';
import { Booking } from 'src/bookings/entities/booking.entity';
import { Workspace } from 'src/workspaces/workspace.entity';
import { PC_ERRORS, PC_CONDITION_ERRORS } from './promo-code.constants';

@Injectable()
export class PromoCodeValidatorService {
  async validatePromoCode(
    code: string,
    userId: number,
    workspace: Workspace,
    totalPrice: number,
    startTime: Date,
    manager: EntityManager,
  ): Promise<PromoCode> {
    const promoCode = await manager.findOne(PromoCode, {
      where: { code },
      lock: { mode: 'pessimistic_write' },
    });

    if (!promoCode) {
      throw new BadRequestException(PC_ERRORS.INVALID);
    }

    if (!promoCode.isActive) {
      throw new BadRequestException(PC_ERRORS.INACTIVE);
    }

    if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
      throw new BadRequestException(PC_ERRORS.EXPIRED);
    }

    if (promoCode.remainingUses === 0) {
      throw new BadRequestException(PC_ERRORS.LIMIT_REACHED);
    }

    const conditions = promoCode.conditions;
    if (!conditions) {
      return promoCode;
    }

    if (conditions.minPrice && totalPrice < conditions.minPrice) {
      throw new BadRequestException(
        `${PC_CONDITION_ERRORS.MIN_PRICE} ${conditions.minPrice / 100} PLN`,
      );
    }

    if (conditions.isFirstBooking) {
      const userBookingCount = await manager.count(Booking, {
        where: { user: { id: userId } },
      });

      if (userBookingCount > 0) {
        throw new BadRequestException(
          PC_CONDITION_ERRORS.NOT_FOR_FIRST_BOOKING,
        );
      }
    }

    const allowedTypes = conditions.allowedWorkspaceTypes;
    if (
      allowedTypes &&
      allowedTypes.length > 0 &&
      !allowedTypes.includes(workspace.type)
    ) {
      throw new BadRequestException(PC_CONDITION_ERRORS.WRONG_WORKSPACE_TYPE);
    }

    if (conditions.onlyWeekends) {
      const dayOfWeek = startTime.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        throw new BadRequestException(PC_CONDITION_ERRORS.ONLY_WEEKENDS);
      }
    }

    return promoCode;
  }
}
