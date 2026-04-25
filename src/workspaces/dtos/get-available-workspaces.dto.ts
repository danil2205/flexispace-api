import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty } from 'class-validator';

export class GetAvailableWorkspacesBaseDto {
  @ApiProperty({ example: '2026-04-24T22:00:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @ApiProperty({ example: '2026-04-24T23:00:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  endTime: Date;
}

export class GetAvailableWorkspacesDto extends IntersectionType(
  GetAvailableWorkspacesBaseDto,
  PaginationQueryDto,
) {}
