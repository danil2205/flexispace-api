import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ example: 'valid-refresh-token' })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
