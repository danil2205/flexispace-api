import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import jwtConfig from './config/jwt.config';
import { ConfigType } from '@nestjs/config';
import { User } from '../users/user.entity';
import { SignInUserDto } from './dtos/signin-user-dto';
import {
  ACCESS_DENIED,
  INVALID_2FA_CODE,
  INVALID_CREDENTIALS,
  INVALID_TOKEN,
  LOGGED_OUT_MESSAGE,
  OAUTH_LOGIN_REQUIRED,
  TOKEN_EXPIRED,
  TWO_FACTOR_AUTH_ENABLED,
  USER_NOT_FOUND,
} from './auth.constants';
import { GoogleUser } from './interfaces/google-user.interface';
import { ActiveUserData } from './interfaces/active-user-data.interface';
import { generateSecret, generateURI, verify } from 'otplib';
import { toDataURL } from 'qrcode';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  public async logout(userId: number) {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: LOGGED_OUT_MESSAGE };
  }

  public async signIn({ email, password }: SignInUserDto) {
    const user = await this.usersService.findOneByEmail(email);

    if (!user) {
      throw new UnauthorizedException(USER_NOT_FOUND);
    }

    if (!user.password) {
      throw new UnauthorizedException(OAUTH_LOGIN_REQUIRED);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.generateTokens(user);
  }

  public async validateGoogleUser(googleUser: GoogleUser) {
    let user = await this.usersService.findOneByEmail(googleUser.email);

    if (user) {
      if (!user.googleId) {
        await this.usersService.update(user.id, {
          googleId: googleUser.googleId,
        });
      }
    } else {
      user = await this.usersService.createOAuthUser(googleUser);
    }

    return this.generateTokens(user);
  }

  public async generateTfaSecret(userId: number) {
    const user = await this.usersService.findOneById(userId);

    if (!user) {
      throw new UnauthorizedException(USER_NOT_FOUND);
    }

    if (user.twoFASecret) {
      throw new BadRequestException(TWO_FACTOR_AUTH_ENABLED);
    }

    const secret = generateSecret();
    const uri = generateURI({
      issuer: 'FlexiSpace',
      label: user.email,
      secret,
    });

    await this.usersService.update(user.id, {
      twoFASecret: secret,
    });

    return { secret, uri };
  }

  public async generateQrCodeDataURL(uri: string) {
    return toDataURL(uri);
  }

  public async isTfaCodeValid(userId: number, code: string) {
    const user = await this.usersService.findOneById(userId);
    const secret = user!.twoFASecret;

    if (!secret) return false;

    const isValid = await verify({ token: code, secret });

    return isValid.valid;
  }

  public async tfaAuthenticate(userId: number, code: string) {
    const user = await this.usersService.findOneById(userId);
    const isCodeValid = await this.isTfaCodeValid(userId, code);

    if (!isCodeValid) {
      throw new UnauthorizedException(INVALID_2FA_CODE);
    }

    return this.generateTokens(user!, true);
  }

  public async signToken<T>(userId: number, payload?: T) {
    return this.jwtService.signAsync(
      {
        sub: userId,
        ...payload,
      },
      {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        expiresIn: payload
          ? this.jwtConfiguration.accessTokenTtl
          : this.jwtConfiguration.refreshTokenTtl,
        secret: payload
          ? this.jwtConfiguration.secret
          : this.jwtConfiguration.refreshSecret,
      },
    );
  }

  public async generateTokens(user: User, is2FAuthenticated = false) {
    const isCompleteLogin = !user.isTwoFAEnabled || is2FAuthenticated;

    const payload: Partial<ActiveUserData> = {
      email: user.email,
      role: user.role,
      isTwoFAuthenticated: isCompleteLogin,
    };

    const accessToken = await this.signToken<Partial<ActiveUserData>>(
      user.id,
      payload,
    );

    if (!isCompleteLogin) {
      return {
        accessToken,
        requires2FA: true,
      };
    }

    const refreshToken = await this.signToken(user.id);
    await this.usersService.updateRefreshToken(user.id, refreshToken);

    return { accessToken, refreshToken, requires2FA: false };
  }

  public async refreshTokens(refreshToken: string) {
    let payload: Pick<ActiveUserData, 'sub'>;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.jwtConfiguration.refreshSecret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });
    } catch {
      throw new ForbiddenException(TOKEN_EXPIRED);
    }

    const user = await this.usersService.findOneById(payload.sub);

    if (!user) {
      throw new UnauthorizedException(USER_NOT_FOUND);
    }

    if (!user.refreshToken) {
      throw new ForbiddenException(ACCESS_DENIED);
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('base64');
    const isRefreshTokenValid = await bcrypt.compare(
      tokenHash,
      user.refreshToken,
    );

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException(INVALID_TOKEN);
    }

    return await this.generateTokens(user, true);
  }
}
