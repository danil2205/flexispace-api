import { PartialType } from '@nestjs/mapped-types';
import { CreatePromoCodeDto } from './create-promo-code.dto';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PatchPromoCodeDto extends PartialType(CreatePromoCodeDto) {
  @ApiProperty({ example: 10 })
  @IsInt()
  @IsOptional()
  @Min(0)
  remainingUses?: number;
}
