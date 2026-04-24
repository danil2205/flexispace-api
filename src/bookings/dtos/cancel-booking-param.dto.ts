import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelBookingParamDto {
  @ApiProperty({ example: '6187b9c9-47f5-43a5-b314-f074082a9ce1' })
  @IsNotEmpty()
  @IsUUID('4')
  id: string;
}
