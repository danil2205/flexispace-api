import { OmitType } from '@nestjs/swagger';
import { CreateBookingDto } from './create-booking.dto';

export class CreateWaitlistDto extends OmitType(CreateBookingDto, [
  'promoCode',
] as const) {}
