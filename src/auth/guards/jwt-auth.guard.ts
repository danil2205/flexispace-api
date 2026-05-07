import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_2FA_SKIPPED_KEY } from '../decorators/skip-2fa.decorator';
import { ActiveUserData } from '../interfaces/active-user-data.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser = any>(
    err: unknown,
    user: any,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }

    const is2FaSkipped = this.reflector.getAllAndOverride<boolean>(
      IS_2FA_SKIPPED_KEY,
      [context.getHandler(), context.getClass()],
    );

    const activeUser = user as ActiveUserData;

    if (!is2FaSkipped && !activeUser.isTwoFAuthenticated) {
      throw new UnauthorizedException('2FA is required');
    }

    return user as TUser;
  }
}
