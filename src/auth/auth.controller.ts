import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInUserDto } from './dtos/signin-user-dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { TfaCodeDto } from './dtos/tfa-code.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { GoogleUser } from './interfaces/google-user.interface';
import { CreateUserDto } from '../users/dtos/create-user.dto';
import { UsersService } from '../users/users.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiTooManyRequestsResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Response } from 'express';
import { ConfigType } from '@nestjs/config';
import appConfig from '../config/app.config';
import { Skip2FA } from './decorators/skip-2fa.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    @Inject(appConfig.KEY)
    private readonly appConfiguration: ConfigType<typeof appConfig>,
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
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  public signIn(@Body() signInUserDto: SignInUserDto) {
    return this.authService.signIn(signInUserDto);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiOkResponse({
    description: 'Redirects to frontend after setting auth cookies',
  })
  async googleAuthRedirect(
    @CurrentUser() googleUser: GoogleUser,
    @Res() res: Response,
  ) {
    const tokens = await this.authService.validateGoogleUser(googleUser);
    const isProduction = this.appConfiguration.environment === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
    };

    res.cookie('accessToken', tokens.accessToken, cookieOptions);

    if (tokens.refreshToken) {
      res.cookie('refreshToken', tokens.refreshToken, cookieOptions);
    }

    if (tokens.requires2FA) {
      return res.redirect('http://localhost:3500/login/2fa');
    }

    return res.redirect('http://localhost:3500/login/success');
  }

  @Post('sign-up')
  @ApiOperation({ summary: 'Register new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedResponse({ description: 'User created successfully' })
  @ApiUnauthorizedResponse({ description: 'Validation or auth error' })
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @ApiOkResponse({
    schema: { example: { message: 'Logged out successfully' } },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  public logout(@CurrentUser('sub') userId: number) {
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
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  public refreshTokens(@Body() { refreshToken }: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshToken);
  }

  @Post('2fa/setup')
  @Skip2FA()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Initialize 2FA setup and return QR code with secret',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        qrCodeDataUrl: {
          type: 'string',
          example: 'data:image/png;base64,...',
        },
        secret: {
          type: 'string',
          example: 'JBSWY3DPEHPK3PXP',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({
    description: '2FA is already enabled for this user',
  })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  public async setup2FA(@CurrentUser('sub') userId: number) {
    const { secret, uri } = await this.authService.generateTfaSecret(userId);
    const qrCodeDataUrl = await this.authService.generateQrCodeDataURL(uri);

    return {
      qrCodeDataUrl,
      secret,
    };
  }

  @Post('2fa/enable')
  @Skip2FA()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Enable 2FA by verifying initial code',
  })
  @ApiBody({ type: TfaCodeDto })
  @ApiOkResponse({
    schema: { example: { message: '2FA turned on successfully' } },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  public async enable2FA(
    @CurrentUser('sub') userId: number,
    @Body() { tfaCode }: TfaCodeDto,
  ) {
    return this.authService.enable2FA(userId, tfaCode);
  }

  @Delete('2fa')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Disable and remove 2FA',
  })
  @ApiBody({ type: TfaCodeDto })
  @ApiOkResponse({
    schema: { example: { message: '2FA turned off successfully' } },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  public async disable2FA(
    @CurrentUser('sub') userId: number,
    @Body() { tfaCode }: TfaCodeDto,
  ) {
    return this.authService.disable2FA(userId, tfaCode);
  }

  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @Skip2FA()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Verify 2FA TOTP code and complete login',
  })
  @ApiBody({ type: TfaCodeDto })
  @ApiOkResponse({
    schema: {
      example: { accessToken: 'jwt_token', refreshToken: 'jwt_token' },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  public async verify2FA(
    @CurrentUser('sub') userId: number,
    @Body() { tfaCode }: TfaCodeDto,
  ) {
    return this.authService.tfaAuthenticate(userId, tfaCode);
  }
}
