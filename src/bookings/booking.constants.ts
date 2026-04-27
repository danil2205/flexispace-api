export const BOOKING_ERRORS = {
  INVALID_DATE_RANGE: 'Start date must be before end date',
  PAST_BOOKING: "Can't create booking in the past",
  WORKSPACE_NOT_FOUND: 'Workspace not found',
  WORKSPACE_OCCUPIED: 'Workspace is already booked',
  NOT_FOUND: 'Booking not found',
  ALREADY_CONFIRMED: 'Booking already confirmed or cancelled',
} as const;

export const BOOKING_MESSAGES = {
  CREATED_SUCCESS: 'Booking created successfully',
  CREATION_FAILED: 'Booking creation failed',
  CANCELLED_SUCCESS: 'Booking cancelled successfully',
} as const;

export const PROMO_CODE_ERRORS = {
  INVALID: 'Invalid promo code',
  INACTIVE: 'Inactive promo code',
  EXPIRED: 'Expired promo code',
  LIMIT_REACHED: 'Promo code limit reached',
} as const;
