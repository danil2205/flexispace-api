import { SetMetadata } from '@nestjs/common';

export const ANTI_FRAUD_LIMIT_KEY = 'antiFraudLimit';

export const AntiFraudLimit = (limit: number) =>
  SetMetadata(ANTI_FRAUD_LIMIT_KEY, limit);
