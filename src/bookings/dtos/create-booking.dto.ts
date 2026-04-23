import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateBookingDto {
  @IsNotEmpty()
  @IsNumber()
  workspaceId: number;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  endTime: Date;
}
