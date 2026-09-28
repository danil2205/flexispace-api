import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ example: 1 })
  @IsNotEmpty()
  @IsNumber()
  workspaceId: number;

  @ApiProperty({ example: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @ApiProperty({
    example: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  endTime: Date;

  @ApiProperty({ example: 'SPRING26', required: false })
  @IsOptional()
  @IsString()
  promoCode?: string;
}
