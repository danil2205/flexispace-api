export const BOOKING_ERRORS = {
  INVALID_DATE_RANGE: 'Start date must be before end date',
  PAST_BOOKING: "Can't create booking in the past",
  WORKSPACE_NOT_FOUND: 'Workspace not found',
  WORKSPACE_OCCUPIED: 'Workspace is already booked',
  NOT_FOUND: 'Booking not found',
  ALREADY_CANCELLED: 'Booking already cancelled',
  TOO_LATE_TO_CANCEL: 'Too late to cancel booking',
} as const;

export const BOOKING_MESSAGES = {
  CREATED_SUCCESS: 'Booking created successfully',
  CREATION_FAILED: 'Booking creation failed',
  CANCELLED_SUCCESS: 'Booking cancelled successfully',
  WAITLISTED_SUCCESS: 'Waitlist created successfully',
} as const;
