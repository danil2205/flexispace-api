import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PromoCode } from './promo-code.entity';
import { EntityManager, Repository } from 'typeorm';
import { CreatePromoCodeDto } from './dtos/create-promo-code.dto';
import { PatchPromoCodeDto } from './dtos/patch-promo-code.dto';

@Injectable()
export class PromoCodesService {
  constructor(
    @InjectRepository(PromoCode)
    private readonly promoCodeRepository: Repository<PromoCode>,
  ) {}

  async create(dto: CreatePromoCodeDto) {
    const exists = await this.promoCodeRepository.findOne({
      where: { code: dto.code.toUpperCase() },
    });

    if (exists) {
      throw new ConflictException('Promo code already exists');
    }

    const promoCode = this.promoCodeRepository.create({
      ...dto,
      code: dto.code.toUpperCase(),
    });

    return this.promoCodeRepository.save(promoCode);
  }

  async findAll() {
    return this.promoCodeRepository.find({ order: { createdAt: 'DESC' } });
  }

  async update(id: string, dto: PatchPromoCodeDto) {
    const promoCode = await this.promoCodeRepository.findOne({ where: { id } });
    if (!promoCode) {
      throw new BadRequestException('Promo code not found');
    }

    promoCode.code = dto.code?.toUpperCase() ?? promoCode.code;
    promoCode.maxUses = dto.maxUses ?? promoCode.maxUses;
    promoCode.remainingUses = dto.remainingUses ?? promoCode.remainingUses;
    promoCode.isActive = dto.isActive ?? promoCode.isActive;
    promoCode.discountPercentage =
      dto.discountPercentage ?? promoCode.discountPercentage;
    promoCode.expiresAt = dto.expiresAt ?? promoCode.expiresAt;
    if (dto.conditions) {
      promoCode.conditions = {
        ...(promoCode.conditions || {}),
        ...dto.conditions,
      };
    }

    return this.promoCodeRepository.save(promoCode);
  }

  async changeUses(
    manager: EntityManager,
    promoCodeId: string,
    change: number,
  ) {
    await manager.update(PromoCode, promoCodeId, {
      remainingUses: () => `remainingUses + ${change}`,
    });
  }
}
