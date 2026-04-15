import { Inject, Injectable, RequestTimeoutException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import jwtConfig from './config/jwt.config';
import { ConfigType } from '@nestjs/config';
import { User } from '../users/user.entity';
import { ActiveUserData } from './interfaces/active-user-data.interface';
import { SignInUserDto } from './dtos/signin-user-dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  public async signIn({ email, password }: SignInUserDto) {
    const user = await this.usersService.findOneByEmail(email);
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch (error) {
      throw new RequestTimeoutException(error, {
        description: 'Could not fetch the user',
      });
    }

    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
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

    return { accessToken, refreshToken };
  }
}
