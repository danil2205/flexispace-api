import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ example: 1 })
  @IsNotEmpty()
  @IsNumber()
  workspaceId: number;

  @ApiProperty({ example: '2026-04-24T22:00:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @ApiProperty({ example: '2026-04-24T23:00:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  endTime: Date;
}
