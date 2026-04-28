import {
  ConflictException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import * as bcrypt from 'bcrypt';
import {
  USER_ALREADY_EXISTS,
  TIMEOUT_EXCEPTION,
  TIMEOUT_EXCEPTION_DESCRIPTION,
} from './users.constants';
import { GoogleUser } from 'src/auth/interfaces/google-user.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findOneByEmail(email: string): Promise<User | null> {
    let user: User | null;

    try {
      user = await this.usersRepository.findOne({
        where: { email },
        select: ['id', 'email', 'password', 'role', 'refreshToken'],
      });
    } catch {
      throw new RequestTimeoutException(TIMEOUT_EXCEPTION, {
        description: TIMEOUT_EXCEPTION_DESCRIPTION,
      });
    }

    return user;
  }

  async findOneById(id: number): Promise<User | null> {
    let user: User | null;

    try {
      user = await this.usersRepository.findOne({
        where: { id },
        select: ['id', 'email', 'password', 'role', 'refreshToken'],
      });
    } catch {
      throw new RequestTimeoutException(TIMEOUT_EXCEPTION, {
        description: TIMEOUT_EXCEPTION_DESCRIPTION,
      });
    }

    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.findOneByEmail(createUserDto.email);

    if (existingUser) {
      throw new ConflictException(USER_ALREADY_EXISTS);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(createUserDto.password, salt);
    let user = this.usersRepository.create({
      ...createUserDto,
      password: passwordHash,
    });

    try {
      user = await this.usersRepository.save(user);
    } catch {
      throw new RequestTimeoutException(TIMEOUT_EXCEPTION, {
        description: TIMEOUT_EXCEPTION_DESCRIPTION,
      });
    }

    return user;
  }

  async createOAuthUser(profile: GoogleUser) {
    let user = await this.findOneByEmail(profile.email);

    if (user) {
      throw new ConflictException(USER_ALREADY_EXISTS);
    }

    user = this.usersRepository.create(profile);

    try {
      user = await this.usersRepository.save(user);
    } catch {
      throw new RequestTimeoutException(TIMEOUT_EXCEPTION, {
        description: TIMEOUT_EXCEPTION_DESCRIPTION,
      });
    }

    return user;
  }

  async update(id: number, attrs: Partial<User>) {
    try {
      await this.usersRepository.update(id, attrs);
    } catch {
      throw new RequestTimeoutException(TIMEOUT_EXCEPTION, {
        description: TIMEOUT_EXCEPTION_DESCRIPTION,
      });
    }
  }

  async updateRefreshToken(userId: number, refreshToken: string | null) {
    if (refreshToken) {
      const salt = await bcrypt.genSalt(10);
      const hashedToken = await bcrypt.hash(refreshToken, salt);
      await this.usersRepository.update(userId, { refreshToken: hashedToken });
    } else {
      await this.usersRepository.update(userId, { refreshToken: null });
    }
  }
}
