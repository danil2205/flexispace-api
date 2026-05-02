import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANTI_FRAUD_LIMIT_KEY } from '../decorators/anti-fraud-limit.decorator';
import { ActiveUserData } from '../interfaces/active-user-data.interface';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AntiFraudCacheData } from '../interfaces/anti-fraud-cache-data.interface';

@Injectable()
export class AntiFraudGuard implements CanActivate {
  readonly PENDING_BOOKING_TTL_MS: number = 600000;

  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limit = this.reflector.get<number>(
      ANTI_FRAUD_LIMIT_KEY,
      context.getHandler(),
    );

    if (!limit) return true;

    const user = context
      .switchToHttp()
      .getRequest<{ user: ActiveUserData }>().user;

    const redisKey = `antifraud:pending_bookings:user:${user.sub}`;
    const now = Date.now();
    let redisData = await this.cacheManager.get<AntiFraudCacheData>(redisKey);

    if (!redisData || now > redisData.expiresAt) {
      redisData = {
        count: 0,
        expiresAt: now + this.PENDING_BOOKING_TTL_MS,
      };
    }

    if (redisData.count >= limit) {
      throw new HttpException(
        'Too many pending bookings. Please pay for them or wait 10 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    redisData.count += 1;
    const remainingTtl = Math.max(0, redisData.expiresAt - now);
    if (remainingTtl > 0) {
      await this.cacheManager.set(redisKey, redisData, remainingTtl);
    } else {
      await this.cacheManager.del(redisKey);
    }

    return true;
  }
}
