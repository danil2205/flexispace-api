import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActiveUserData } from '../interfaces/active-user-data.interface';
import { RequestWithUser } from '../interfaces/request-with-user.interface';

export const ActiveUser = createParamDecorator(
  (data: keyof ActiveUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user: ActiveUserData = request.user;
    return data ? user?.[data] : user;
  },
);
