import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(96)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(96)
  lastName: string;

  @ApiProperty({ example: 'johndoe@gmail.com' })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(96)
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword(
    {},
    {
      message:
        'Password is too weak. It must contain at least 8 characters, including uppercase, lowercase, numbers, and symbols.',
    },
  )
  @MaxLength(96)
  password: string;
}
