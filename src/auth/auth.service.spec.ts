import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI, verify } from 'otplib';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import jwtConfig from './config/jwt.config';
import { ConfigType } from '@nestjs/config';
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
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '../users/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let mockUsersService: Partial<UsersService>;
  let mockJwtService: Partial<JwtService>;
  let mockJwtConfiguration: ConfigType<typeof jwtConfig>;
  let mockUser: User;

  beforeEach(async () => {
    mockUsersService = {
      updateRefreshToken: jest.fn(),
      findOneByEmail: jest.fn(),
      update: jest.fn(),
      findOneById: jest.fn(),
      createOAuthUser: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('mockToken'),
      verifyAsync: jest.fn(),
    };

    mockJwtConfiguration = {
      audience: 'test_audience',
      issuer: 'test_issuer',
      accessTokenTtl: 3600,
      refreshTokenTtl: 86400,
      secret: 'test_secret',
      refreshSecret: 'test_refresh_secret',
    };

    mockUser = {
      id: 1,
      email: 'test@example.com',
      password: 'hashedPassword',
      role: UserRole.USER,
      isTwoFAEnabled: false,
      twoFASecret: null as string | null,
      refreshToken: 'hashedRefreshToken',
      googleId: null as string | null,
    } as User;

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: jwtConfig.KEY,
          useValue: mockJwtConfiguration,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logout', () => {
    it('should logout user if token is valid', async () => {
      const result = await service.logout(1);

      expect(mockUsersService.updateRefreshToken).toHaveBeenCalledWith(1, null);
      expect(result).toEqual({ message: LOGGED_OUT_MESSAGE });
    });
  });

  describe('signIn', () => {
    it('should throw error if user not found', async () => {
      (mockUsersService.findOneByEmail as jest.Mock).mockResolvedValue(null);
      await expect(
        service.signIn({ email: 'test@test.com', password: 'password' }),
      ).rejects.toThrow(new UnauthorizedException(USER_NOT_FOUND));
    });

    it('should throw error if user has no password', async () => {
      (mockUsersService.findOneByEmail as jest.Mock).mockResolvedValue({
        ...mockUser,
        password: null,
      });

      await expect(
        service.signIn({ email: 'test@test.com', password: 'password' }),
      ).rejects.toThrow(new UnauthorizedException(OAUTH_LOGIN_REQUIRED));
    });

    it('should throw error if password is invalid', async () => {
      (mockUsersService.findOneByEmail as jest.Mock).mockResolvedValue(
        mockUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.signIn({ email: 'test@test.com', password: '1234' }),
      ).rejects.toThrow(new UnauthorizedException(INVALID_CREDENTIALS));
    });

    it('should return tokens on valid credentials', async () => {
      (mockUsersService.findOneByEmail as jest.Mock).mockResolvedValue(
        mockUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const tokens = { accessToken: 'token', requires2FA: false };
      const generateTokensSpy = jest
        .spyOn(service, 'generateTokens')
        .mockResolvedValue(tokens);

      const result = await service.signIn({
        email: 'test@test.com',
        password: 'password',
      });

      expect(result).toEqual(tokens);
      expect(generateTokensSpy).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('validateGoogleUser', () => {
    const tokens = { accessToken: 'token', requires2FA: false };

    const googleProfile = {
      email: 'test@test.com',
      googleId: 'g-123',
      firstName: 'test',
      lastName: 'test',
    };

    it('should link googleId if existing user has no googleId', async () => {
      (mockUsersService.findOneByEmail as jest.Mock).mockResolvedValue(
        mockUser,
      );

      await service.validateGoogleUser(googleProfile);

      expect(mockUsersService.update).toHaveBeenCalledWith(mockUser.id, {
        googleId: googleProfile.googleId,
      });
    });

    it('should not update googleId if user already has one', async () => {
      const existingUser = { ...mockUser, googleId: 'googleId' };
      (mockUsersService.findOneByEmail as jest.Mock).mockResolvedValue(
        existingUser,
      );

      await service.validateGoogleUser(googleProfile);

      expect(mockUsersService.update).not.toHaveBeenCalled();
    });

    it('should create new user if not exists and return tokens', async () => {
      (mockUsersService.findOneByEmail as jest.Mock).mockResolvedValue(null);
      jest.spyOn(service, 'generateTokens').mockResolvedValue(tokens);

      const result = await service.validateGoogleUser(googleProfile);

      expect(mockUsersService.createOAuthUser).toHaveBeenCalledWith(
        googleProfile,
      );
      expect(result).toEqual(tokens);
    });
  });

  describe('generateTfaSecret', () => {
    it('should throw error if user not found', async () => {
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue(null);
      await expect(service.generateTfaSecret(1)).rejects.toThrow(
        new UnauthorizedException(USER_NOT_FOUND),
      );
    });

    it('should throw error if 2FA is already enabled', async () => {
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue({
        ...mockUser,
        twoFASecret: 'secret',
      });
      await expect(service.generateTfaSecret(1)).rejects.toThrow(
        new BadRequestException(TWO_FACTOR_AUTH_ENABLED),
      );
    });

    it('should generate secret and uri, then save to user', async () => {
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue(mockUser);
      (generateSecret as jest.Mock).mockReturnValue('secret');
      (generateURI as jest.Mock).mockReturnValue(
        'otpauth://totp/FlexiSpace:test@example.com?secret=secret',
      );

      const result = await service.generateTfaSecret(1);

      expect(result).toEqual({
        secret: 'secret',
        uri: 'otpauth://totp/FlexiSpace:test@example.com?secret=secret',
      });

      expect(mockUsersService.update).toHaveBeenCalledWith(1, {
        twoFASecret: 'secret',
      });
    });
  });

  describe('isTfaCodeValid', () => {
    it('should return false if user has no 2FA secret', async () => {
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.isTfaCodeValid(1, '123456');

      expect(result).toBe(false);
    });

    it('should return true if 2FA code is valid', async () => {
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue({
        ...mockUser,
        twoFASecret: 'secret',
      });
      (verify as jest.Mock).mockResolvedValue({ valid: true });

      const result = await service.isTfaCodeValid(1, '123456');

      expect(verify).toHaveBeenCalledWith({
        token: '123456',
        secret: 'secret',
      });
      expect(result).toBe(true);
    });
  });

  describe('tfaAuthenticate', () => {
    it('should throw error if code is invalid', async () => {
      jest.spyOn(service, 'isTfaCodeValid').mockResolvedValue(false);

      await expect(service.tfaAuthenticate(1, '123456')).rejects.toThrow(
        new UnauthorizedException(INVALID_2FA_CODE),
      );
    });

    it('should return tokens if code is valid', async () => {
      const tokens = { accessToken: 'token', requires2FA: false };
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue(mockUser);
      jest.spyOn(service, 'isTfaCodeValid').mockResolvedValue(true);
      const generateTokensSpy = jest
        .spyOn(service, 'generateTokens')
        .mockResolvedValue(tokens);

      const result = await service.tfaAuthenticate(1, '123456');

      expect(generateTokensSpy).toHaveBeenCalledWith(mockUser, true);
      expect(result).toEqual(tokens);
    });
  });

  describe('generateTokens', () => {
    it('should return partial tokens if 2fa is required', async () => {
      const userWith2FA = { ...mockUser, isTwoFAEnabled: true };
      const signTokenSpy = jest
        .spyOn(service, 'signToken')
        .mockResolvedValue('access_token');

      const result = await service.generateTokens(userWith2FA, false);

      expect(signTokenSpy).toHaveBeenCalledWith(
        userWith2FA.id,
        expect.objectContaining({ isTwoFAuthenticated: false }),
      );

      expect(result).toEqual({
        accessToken: 'access_token',
        requires2FA: true,
      });

      expect(mockUsersService.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('should return full tokens if 2fa is disabled or already authenticated', async () => {
      jest
        .spyOn(service, 'signToken')
        .mockResolvedValueOnce('access_token')
        .mockResolvedValueOnce('refresh_token');

      const result = await service.generateTokens(mockUser, false);

      expect(result).toEqual({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        requires2FA: false,
      });

      expect(mockUsersService.updateRefreshToken).toHaveBeenCalledWith(
        mockUser.id,
        'refresh_token',
      );
    });
  });

  describe('refreshTokens', () => {
    const refreshToken = 'refresh_token';

    it('should throw error if token is expired or invalid', async () => {
      (mockJwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('jwt expired'),
      );

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        new ForbiddenException(TOKEN_EXPIRED),
      );
    });

    it('should throw error if user has logged out', async () => {
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 1 });
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue(null);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        new UnauthorizedException(USER_NOT_FOUND),
      );
    });

    it('should throw error if user has no refresh token', async () => {
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 1 });
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue({
        ...mockUser,
        refreshToken: null,
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        new ForbiddenException(ACCESS_DENIED),
      );
    });

    it('should throw error if refresh token is invalid', async () => {
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 1 });
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        new UnauthorizedException(INVALID_TOKEN),
      );
    });

    it('should return new tokens if refresh token is valid', async () => {
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 1 });
      (mockUsersService.findOneById as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const generateTokensSpy = jest
        .spyOn(service, 'generateTokens')
        .mockResolvedValue({
          accessToken: 'access_token',
          refreshToken: 'refresh_token',
          requires2FA: false,
        });

      const result = await service.refreshTokens(refreshToken);

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(refreshToken, {
        secret: mockJwtConfiguration.refreshSecret,
        audience: mockJwtConfiguration.audience,
        issuer: mockJwtConfiguration.issuer,
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(
        refreshToken,
        mockUser.refreshToken,
      );

      expect(generateTokensSpy).toHaveBeenCalledWith(mockUser, true);

      expect(result).toEqual({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        requires2FA: false,
      });
    });
  });
});
