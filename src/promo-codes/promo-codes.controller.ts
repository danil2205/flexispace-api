import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
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
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/users/enums/user-role.enum';
import { PatchPromoCodeDto } from './dtos/patch-promo-code.dto';

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
  @ApiBadRequestResponse({ description: 'Invalid promo code data' })
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

  @Patch(':id')
  @ApiOperation({ summary: 'Update promo code (admin only)' })
  @ApiOkResponse({ description: 'Promo code updated successfully' })
  @ApiBadRequestResponse({ description: 'Promo code not found' })
  async update(@Param('id') id: string, @Body() dto: PatchPromoCodeDto) {
    return this.promoCodesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete promo code (admin only)' })
  @ApiOkResponse({ description: 'Promo code deleted successfully' })
  @ApiBadRequestResponse({ description: 'Promo code not found' })
  async delete(@Param('id') id: string) {
    return this.promoCodesService.delete(id);
  }
}
