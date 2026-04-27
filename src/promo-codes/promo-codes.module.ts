import { Module } from '@nestjs/common';
import { PromoCodesService } from './promo-codes.service';
import { PromoCodesController } from './promo-codes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode } from './promo-code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PromoCode])],
  providers: [PromoCodesService],
  controllers: [PromoCodesController],
  exports: [PromoCodesService],
})
export class PromoCodesModule {}
