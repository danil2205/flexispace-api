import { ApiProperty } from '@nestjs/swagger';
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
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  pricePerHour: number;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsEnum(WorkspaceType)
  type: WorkspaceType;

  @IsString()
  @IsOptional()
  imageUrl: string;
}
