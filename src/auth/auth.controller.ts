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
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in user and return access/refresh tokens',
  })
  @ApiBody({ type: SignInUserDto })
  @ApiOkResponse({
    description: 'User successfully signed in',
    schema: {
      example: {
        accessToken: 'jwt_access_token',
        refreshToken: 'jwt_refresh_token',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  public signIn(@Body() signInUserDto: SignInUserDto) {
    return this.authService.signIn(signInUserDto);
  }

  @Post('sign-up')
  @ApiOperation({
    summary: 'Register new user',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ description: 'User created successfully' })
  @ApiUnauthorizedResponse({ description: 'Validation or auth error' })
  public createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Logout current user',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({
    schema: { example: { message: 'Logged out successfully' } },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  public logout(@ActiveUser('sub') userId: number) {
    return this.authService.logout(userId);
  }

  @Post('refresh-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access and refresh tokens',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({
    description: 'Tokens refreshed',
    schema: {
      example: {
        accessToken: 'new_jwt_access_token',
        refreshToken: 'new_jwt_refresh_token',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Refresh token expired or access denied',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  public refreshTokens(@Body() { refreshToken }: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshToken);
  }
}
