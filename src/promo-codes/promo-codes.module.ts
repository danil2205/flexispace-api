import { Module } from '@nestjs/common';
import { PromoCodesService } from './promo-codes.service';
import { PromoCodesController } from './promo-codes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode } from './promo-code.entity';
import { PromoCodeValidatorService } from './promo-code-validator.service';

@Module({
  imports: [TypeOrmModule.forFeature([PromoCode])],
  providers: [PromoCodesService, PromoCodeValidatorService],
  controllers: [PromoCodesController],
  exports: [PromoCodesService, PromoCodeValidatorService],
})
export class PromoCodesModule {}
