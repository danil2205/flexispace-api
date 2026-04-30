import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsISO4217CurrencyCode,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';

export class SendReceiptDto {
  @IsEmail()
  email: string;

  @IsString()
  userName: string;

  @IsString()
  workspaceTitle: string;

  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @Type(() => Date)
  @IsDate()
  endTime: Date;

  @IsNumber()
  @Min(0)
  totalPrice: number;

  @IsString()
  @IsISO4217CurrencyCode()
  currency: string;
}
