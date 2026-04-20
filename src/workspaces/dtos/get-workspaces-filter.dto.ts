import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { WorkspaceType } from '../enums/workspace-type.enum';
import { IntersectionType } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';

export class GetWorkspacesFilterBaseDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minCapacity?: number;

  @IsOptional()
  @IsEnum(WorkspaceType)
  type?: WorkspaceType;
}

export class GetWorkspacesFilterDto extends IntersectionType(
  GetWorkspacesFilterBaseDto,
  PaginationQueryDto,
) {}
