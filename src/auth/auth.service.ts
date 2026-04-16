import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import jwtConfig from './config/jwt.config';
import { ConfigType } from '@nestjs/config';
import { User } from '../users/user.entity';
import { ActiveUserData } from './interfaces/active-user-data.interface';
import { SignInUserDto } from './dtos/signin-user-dto';
import {
  ACCESS_DENIED,
  INVALID_CREDENTIALS,
  INVALID_TOKEN,
  LOGGED_OUT_MESSAGE,
  TOKEN_EXPIRED,
} from './auth.constants';

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
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.generateTokens(user);
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

  public async generateTokens(user: User) {
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(user.id, {
        email: user.email,
        role: user.role,
      }),
      this.signToken(user.id),
    ]);

    await this.usersService.updateRefreshToken(user.id, refreshToken);

    return { accessToken, refreshToken };
  }

  public async refreshTokens(refreshToken: string) {
    const { sub } =
      this.jwtService.decode<Pick<ActiveUserData, 'sub'>>(refreshToken);

    const user = await this.usersService.findOneById(sub);
    if (!user.refreshToken) {
      throw new ForbiddenException(ACCESS_DENIED);
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException(INVALID_TOKEN);
    }

    try {
      await this.jwtService.verifyAsync(refreshToken, {
        secret: this.jwtConfiguration.refreshSecret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });
    } catch {
      throw new ForbiddenException(TOKEN_EXPIRED);
    }

    return await this.generateTokens(user);
  }
}
