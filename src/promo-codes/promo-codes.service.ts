import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PromoCode } from './promo-code.entity';
import { Repository } from 'typeorm';
import { CreatePromoCodeDto } from './dtos/create-promo-code.dto';

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
}
