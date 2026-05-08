import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { WorkspaceType } from '../enums/workspace-type.enum';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Quiet Meeting Room' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: 'A quiet meeting room with a large table and whiteboard',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(0)
  pricePerHour: number;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiProperty({ enum: WorkspaceType, example: WorkspaceType.MEETING_ROOM })
  @IsEnum(WorkspaceType)
  type: WorkspaceType;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}
