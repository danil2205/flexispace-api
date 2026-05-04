import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANTI_FRAUD_LIMIT_KEY } from '../decorators/anti-fraud-limit.decorator';
import { ActiveUserData } from '../interfaces/active-user-data.interface';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AntiFraudCacheData } from '../interfaces/anti-fraud-cache-data.interface';
import { catchError, Observable } from 'rxjs';

@Injectable()
export class AntiFraudInterceptor implements NestInterceptor {
  readonly PENDING_BOOKING_TTL_MS: number = 600000;

  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const limit = this.reflector.get<number>(
      ANTI_FRAUD_LIMIT_KEY,
      context.getHandler(),
    );

    if (!limit) return next.handle();

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

    return next.handle().pipe(
      catchError(async (err: Error) => {
        await this.rollbackRedisCount(redisKey);
        throw err;
      }),
    );
  }

  private async rollbackRedisCount(redisKey: string) {
    const redisData = await this.cacheManager.get<AntiFraudCacheData>(redisKey);
    const now = Date.now();

    if (redisData && redisData.count > 0 && now < redisData.expiresAt) {
      redisData.count -= 1;
      const remainingTtl = Math.max(0, redisData.expiresAt - now);
      await this.cacheManager.set(redisKey, redisData, remainingTtl);
    }
  }
}
