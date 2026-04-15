import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SignInUserDto {
  @IsNotEmpty()
  @MaxLength(96)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(96)
  password: string;
}
