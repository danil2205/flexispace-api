export const PC_ERRORS = {
  INVALID: 'Promo code not found',
  INACTIVE: 'Promo code is not active',
  EXPIRED: 'Promo code has expired',
  LIMIT_REACHED: 'Promo code has reached its limit',
} as const;

export const PC_CONDITION_ERRORS = {
  NOT_FOR_FIRST_BOOKING: 'This promo code is only for first bookings',
  MIN_PRICE: 'This promo code requires a minimum order price',
  WRONG_WORKSPACE_TYPE: 'This promo code is not valid for this workspace type',
  ONLY_WEEKENDS: 'This promo code is only valid for weekends',
} as const;
