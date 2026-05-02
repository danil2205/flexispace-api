import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => ({
  environment: process.env.NODE_ENV || 'production',
  throttling: {
    windowMs: Number(process.env.THROTTLING_WINDOW_MS) || 60000,
    limit: Number(process.env.THROTTLING_LIMIT) || 10,
  },
}));
