import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/pagination/dtos/pagination-query.dto';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty } from 'class-validator';

export class GetAvailableWorkspacesBaseDto {
  @ApiProperty({ example: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @ApiProperty({
    example: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  endTime: Date;
}

export class GetAvailableWorkspacesDto extends IntersectionType(
  GetAvailableWorkspacesBaseDto,
  PaginationQueryDto,
) {}
