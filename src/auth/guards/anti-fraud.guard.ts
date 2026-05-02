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
    const currentCount = (await this.cacheManager.get<number>(redisKey)) || 0;

    if (currentCount >= limit) {
      throw new HttpException(
        'Too many pending bookings. Please pay for them or wait 10 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.cacheManager.set(
      redisKey,
      currentCount + 1,
      this.PENDING_BOOKING_TTL_MS,
    );

    return true;
  }
}
