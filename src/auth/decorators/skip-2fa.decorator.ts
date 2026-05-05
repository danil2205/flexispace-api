import { SetMetadata } from '@nestjs/common';

export const IS_2FA_SKIPPED_KEY = 'isTwoFaSkipped';

export const Skip2FA = () => SetMetadata(IS_2FA_SKIPPED_KEY, true);
