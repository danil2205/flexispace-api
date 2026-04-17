import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInUserDto } from './dtos/signin-user-dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { ActiveUser } from './decorators/active-user.decorator';
import { CreateUserDto } from '../users/dtos/create-user.dto';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  public signIn(@Body() signInUserDto: SignInUserDto) {
    return this.authService.signIn(signInUserDto);
  }

  @Post('sign-up')
  public createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  public logout(@ActiveUser('sub') userId: number) {
    return this.authService.logout(userId);
  }

  @Post('refresh-tokens')
  @HttpCode(HttpStatus.OK)
  public refreshTokens(@Body() { refreshToken }: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshToken);
  }
}
