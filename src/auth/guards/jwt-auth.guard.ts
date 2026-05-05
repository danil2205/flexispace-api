import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_2FA_SKIPPED_KEY } from '../decorators/skip-2fa.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }

    const is2FaSkipped = this.reflector.getAllAndOverride<boolean>(
      IS_2FA_SKIPPED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!is2FaSkipped && !user.isTwoFAuthenticated) {
      throw new UnauthorizedException('2FA is required');
    }

    return user;
  }
}
