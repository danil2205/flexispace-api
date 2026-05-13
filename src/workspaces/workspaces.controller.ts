import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateWorkspaceDto } from './dtos/create-workspace.dto';
import { GetWorkspacesFilterDto } from './dtos/get-workspaces-filter.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WorkspaceType } from './enums/workspace-type.enum';
import { GetAvailableWorkspacesDto } from './dtos/get-available-workspaces.dto';
import { fromEvent, map, Observable } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkspaceUpdatedEvent } from './events/workspace-updated.event';

@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all workspaces with optional filters' })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'minCapacity', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: WorkspaceType })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiOkResponse({ description: 'List of workspaces' })
  @ApiBadRequestResponse({
    description:
      'Invalid query parameters (e.g. non-numeric minPrice or minCapacity)',
  })
  public async findAll(@Query() query: GetWorkspacesFilterDto) {
    return this.workspacesService.findAll(query);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get all available workspaces by date range' })
  @ApiQuery({ name: 'startTime', required: true, type: Date })
  @ApiQuery({ name: 'endTime', required: true, type: Date })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiOkResponse({ description: 'List of available workspaces' })
  @ApiBadRequestResponse({
    description:
      'Invalid date range (endTime must be greater than startTime or startTime must be in the future',
  })
  public async findAvailableWorkspaces(
    @Query() query: GetAvailableWorkspacesDto,
  ) {
    return this.workspacesService.findAvailableWorkspaces(query);
  }

  @Sse('live-updates')
  @ApiOperation({ summary: 'Subscribe to live workspace updates' })
  @ApiOkResponse({ description: 'Workspace updates' })
  public subscribeToWorkspaceUpdates(): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'workspace.updated').pipe(
      map(
        (payload: WorkspaceUpdatedEvent) =>
          ({
            data: {
              event: payload.event,
              workspaceId: payload.workspaceId,
              startTime: payload.startTime,
              endTime: payload.endTime,
            },
          }) as MessageEvent,
      ),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace by ID' })
  @ApiParam({ name: 'id', type: Number, required: true, example: 1 })
  @ApiOkResponse({ description: 'Workspace found' })
  @ApiBadRequestResponse({ description: 'Invalid workspace id' })
  public async findOneById(@Param('id', ParseIntPipe) id: number) {
    return this.workspacesService.findOneById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create workspace' })
  @ApiBody({ type: CreateWorkspaceDto })
  @ApiCreatedResponse({ description: 'Workspace created successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({
    description: 'Forbidden: admin or manager role required',
  })
  public async create(@Body() createWorkspaceDto: CreateWorkspaceDto) {
    return this.workspacesService.create(createWorkspaceDto);
  }
}
