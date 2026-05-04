import { Booking } from '../entities/booking.entity';

export class BookingCancelledEvent {
  constructor(
    public readonly booking: Booking,
    public readonly amountToRefund: number = 0,
    public readonly wasPending: boolean = true,
  ) {}
}
