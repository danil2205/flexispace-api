import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsDate,
  IsInt,
  Min,
  IsOptional,
  IsBoolean,
  Max,
  IsObject,
} from 'class-validator';

export class CreatePromoCodeDto {
  @ApiProperty({ example: 'SPRING26' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  maxUses: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercentage: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @ApiPropertyOptional({ example: { minAmount: 50000, isFirstBooking: true } })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>;
}
