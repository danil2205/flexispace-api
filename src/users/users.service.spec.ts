import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, RequestTimeoutException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { GoogleUser } from '../auth/interfaces/google-user.interface';

jest.mock('bcrypt', () => ({
  genSalt: jest.fn().mockResolvedValue('mockSalt'),
  hash: jest.fn().mockResolvedValue('mockHashedString'),
}));

describe('UsersService', () => {
  let service: UsersService;
  let mockUsersRepository: Partial<Repository<User>>;
  let mockUser: User;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUsersRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    mockUser = {
      id: 1,
      email: 'test@test.com',
      password: 'hashedPassword',
    } as User;

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should throw an exception if the query fails', async () => {
      (mockUsersRepository.find as jest.Mock).mockRejectedValue(
        new Error('db error'),
      );
      await expect(service.findAll()).rejects.toThrow(RequestTimeoutException);
    });

    it('should return all users', async () => {
      const users = [{ id: 1 }, { id: 2 }];
      (mockUsersRepository.find as jest.Mock).mockResolvedValue(users);
      const result = await service.findAll();
      expect(mockUsersRepository.find).toHaveBeenCalledTimes(1);
      expect(result).toEqual(users);
    });
  });

  describe('findOneByEmail', () => {
    it('should throw an exception if the query fails', async () => {
      (mockUsersRepository.findOne as jest.Mock).mockRejectedValue(
        new Error('db error'),
      );
      await expect(service.findOneByEmail('test@test.com')).rejects.toThrow(
        RequestTimeoutException,
      );
    });

    it('should return a user if found', async () => {
      const user = { id: 1, email: 'test@test.com' };
      (mockUsersRepository.findOne as jest.Mock).mockResolvedValue(user);
      const result = await service.findOneByEmail('test@test.com');
      expect(mockUsersRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@test.com' },
        select: expect.any(Array) as string[],
      });
      expect(result).toEqual(user);
    });

    it('should return null if not found', async () => {
      (mockUsersRepository.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.findOneByEmail('test@test.com');
      expect(result).toBeNull();
    });
  });

  describe('findOneById', () => {
    const id = 1;

    it('should throw an exception if the query fails', async () => {
      (mockUsersRepository.findOne as jest.Mock).mockRejectedValue(
        new Error('db error'),
      );
      await expect(service.findOneById(id)).rejects.toThrow(
        RequestTimeoutException,
      );
    });

    it('should return a user if found', async () => {
      const user = { id };
      (mockUsersRepository.findOne as jest.Mock).mockResolvedValue(user);
      const result = await service.findOneById(id);
      expect(mockUsersRepository.findOne).toHaveBeenCalledWith({
        where: { id },
        select: expect.any(Array) as string[],
      });
      expect(result).toEqual(user);
    });

    it('should return null if not found', async () => {
      (mockUsersRepository.findOne as jest.Mock).mockResolvedValue(null);
      const result = await service.findOneById(id);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const createUserDto = {
      email: 'test@test.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
    };

    it('should throw error if user already exists', async () => {
      jest.spyOn(service, 'findOneByEmail').mockResolvedValue(mockUser);

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw an exception if the query fails', async () => {
      jest.spyOn(service, 'findOneByEmail').mockResolvedValue(null);

      (mockUsersRepository.create as jest.Mock).mockReturnValue({});
      (mockUsersRepository.save as jest.Mock).mockRejectedValue(
        new Error('db error'),
      );
      await expect(service.create(createUserDto)).rejects.toThrow(
        RequestTimeoutException,
      );
    });

    it('should succesfuly create user and save it', async () => {
      const user = {
        id: 1,
        ...createUserDto,
        password: 'mockHashedString',
      };

      jest.spyOn(service, 'findOneByEmail').mockResolvedValue(null);

      (mockUsersRepository.create as jest.Mock).mockReturnValue({
        ...createUserDto,
        password: 'mockHashedString',
      });
      (mockUsersRepository.save as jest.Mock).mockResolvedValue(user);

      const result = await service.create(createUserDto);

      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 'mockSalt');
      expect(mockUsersRepository.create).toHaveBeenCalledWith({
        ...createUserDto,
        password: 'mockHashedString',
      });
      expect(mockUsersRepository.save).toHaveBeenCalled();
      expect(result).toEqual(user);
    });
  });

  describe('createOAuthUser', () => {
    const googleProfile: GoogleUser = {
      email: 'test@test.com',
      firstName: 'Google',
      lastName: 'User',
    } as GoogleUser;

    it('should throw error if user already exists', async () => {
      jest.spyOn(service, 'findOneByEmail').mockResolvedValue(mockUser);

      await expect(service.createOAuthUser(googleProfile)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw an exception if the query fails', async () => {
      jest.spyOn(service, 'findOneByEmail').mockResolvedValue(null);

      (mockUsersRepository.create as jest.Mock).mockReturnValue({});
      (mockUsersRepository.save as jest.Mock).mockRejectedValue(
        new Error('db error'),
      );
      await expect(service.createOAuthUser(googleProfile)).rejects.toThrow(
        RequestTimeoutException,
      );
    });

    it('should create and save a new OAuth user', async () => {
      jest.spyOn(service, 'findOneByEmail').mockResolvedValue(null);
      (mockUsersRepository.create as jest.Mock).mockReturnValue(googleProfile);
      (mockUsersRepository.save as jest.Mock).mockResolvedValue({
        id: 1,
        ...googleProfile,
      });

      const result = await service.createOAuthUser(googleProfile);

      expect(mockUsersRepository.create).toHaveBeenCalledWith(googleProfile);
      expect(mockUsersRepository.save).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });
  });

  describe('update', () => {
    it('should throw an exception if the query fails', async () => {
      (mockUsersRepository.update as jest.Mock).mockRejectedValue(
        new Error('db error'),
      );
      await expect(service.update(1, {})).rejects.toThrow(
        RequestTimeoutException,
      );
    });

    it('should update user attributes', async () => {
      (mockUsersRepository.update as jest.Mock).mockResolvedValue({
        affected: 1,
      });

      await service.update(1, { isTwoFAEnabled: true });
      expect(mockUsersRepository.update).toHaveBeenCalledWith(1, {
        isTwoFAEnabled: true,
      });
    });
  });

  describe('updateRefreshToken', () => {
    it('should hash token and update if token is provided', async () => {
      await service.updateRefreshToken(1, 'refreshToken');

      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith('refreshToken', 'mockSalt');
      expect(mockUsersRepository.update).toHaveBeenCalledWith(1, {
        refreshToken: 'mockHashedString',
      });
    });

    it('should set refresh token to null if null is provided', async () => {
      await service.updateRefreshToken(1, null);
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(mockUsersRepository.update).toHaveBeenCalledWith(1, {
        refreshToken: null,
      });
    });
  });
});
