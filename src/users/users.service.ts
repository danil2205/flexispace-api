import {
  ConflictException,
  Injectable,
  RequestTimeoutException,
  UnauthorizedException,
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
  USER_NOT_FOUND,
} from './users.constants';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findOneByEmail(email: string): Promise<User> {
    let user: User | null;

    try {
      user = await this.usersRepository.findOneBy({ email });
    } catch {
      throw new RequestTimeoutException(TIMEOUT_EXCEPTION, {
        description: TIMEOUT_EXCEPTION_DESCRIPTION,
      });
    }

    if (!user) {
      throw new UnauthorizedException(USER_NOT_FOUND);
    }

    return user;
  }

  async findOneById(id: number): Promise<User> {
    let user: User | null;

    try {
      user = await this.usersRepository.findOneBy({ id });
    } catch {
      throw new RequestTimeoutException(TIMEOUT_EXCEPTION, {
        description: TIMEOUT_EXCEPTION_DESCRIPTION,
      });
    }

    if (!user) {
      throw new UnauthorizedException(USER_NOT_FOUND);
    }

    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    let existingUser: User | null;
    try {
      existingUser = await this.usersRepository.findOneBy({
        email: createUserDto.email,
      });
    } catch {
      throw new RequestTimeoutException(TIMEOUT_EXCEPTION, {
        description: TIMEOUT_EXCEPTION_DESCRIPTION,
      });
    }

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
