import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { WorkspaceType } from '../enums/workspace-type.enum';
import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';

export class GetWorkspacesFilterBaseDto {
  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minCapacity?: number;

  @ApiPropertyOptional({ enum: WorkspaceType })
  @IsOptional()
  @IsEnum(WorkspaceType)
  type?: WorkspaceType;
}

export class GetWorkspacesFilterDto extends IntersectionType(
  GetWorkspacesFilterBaseDto,
  PaginationQueryDto,
) {}
