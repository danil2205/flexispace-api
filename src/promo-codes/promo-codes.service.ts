import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PromoCode } from './promo-code.entity';
import { EntityManager, Repository } from 'typeorm';
import { CreatePromoCodeDto } from './dtos/create-promo-code.dto';
import { PatchPromoCodeDto } from './dtos/patch-promo-code.dto';
import { PC_ERRORS } from './promo-code.constants';

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
      throw new ConflictException(PC_ERRORS.ALREADY_EXISTS);
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

  async findOneById(id: string): Promise<PromoCode> {
    const promoCode = await this.promoCodeRepository.findOne({ where: { id } });

    if (!promoCode) {
      throw new NotFoundException(PC_ERRORS.NOT_FOUND);
    }

    return promoCode;
  }

  async update(id: string, dto: PatchPromoCodeDto) {
    const promoCode = await this.findOneById(id);

    Object.assign(promoCode, {
      ...dto,
      ...(dto.code && { code: dto.code.toUpperCase() }),
      ...(dto.conditions && {
        conditions: {
          ...promoCode.conditions,
          ...dto.conditions,
        },
      }),
    });

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

  async delete(id: string): Promise<void> {
    await this.findOneById(id);
    await this.promoCodeRepository.softDelete(id);
  }
}
