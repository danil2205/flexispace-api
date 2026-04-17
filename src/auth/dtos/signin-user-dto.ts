import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SignInUserDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(96)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(96)
  password: string;
}
