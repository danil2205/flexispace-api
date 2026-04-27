import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { PromoCodesService } from './promo-codes.service';
import { CreatePromoCodeDto } from './dtos/create-promo-code.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/users/enums/user-role.enum';

@ApiTags('Promo Codes')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiForbiddenResponse({ description: 'Forbidden - Requires admin role' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('promocodes')
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new promo code (admin only)' })
  @ApiCreatedResponse({ description: 'Promo code created successfully' })
  @ApiConflictResponse({ description: 'Promo code already exists' })
  async create(@Body() dto: CreatePromoCodeDto) {
    return this.promoCodesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all promo codes (admin only)' })
  @ApiOkResponse({ description: 'List of all promo codes' })
  async findAll() {
    return this.promoCodesService.findAll();
  }
}
