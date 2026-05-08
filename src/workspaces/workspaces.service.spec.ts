import { Test } from '@nestjs/testing';
import { WorkspacesService } from './workspaces.service';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Workspace } from './workspace.entity';
import { Cache } from 'cache-manager';
import { PaginationProvider } from '../common/pagination/providers/pagination.provider';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetWorkspacesFilterDto } from './dtos/get-workspaces-filter.dto';
import { WorkspaceType } from './enums/workspace-type.enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  INVALID_DATE_RANGE_ERROR,
  PAST_TIME_ERROR,
} from './workspaces.constants';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let mockQueryBuilder: Partial<SelectQueryBuilder<Workspace>>;
  let mockWorkspaceRepository: Partial<Repository<Workspace>>;
  let mockPaginationProvider: Partial<PaginationProvider>;
  let mockCacheManager: Partial<Cache>;

  beforeEach(async () => {
    mockQueryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };

    mockWorkspaceRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockPaginationProvider = {
      paginateQuery: jest.fn(),
    };

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: PaginationProvider,
          useValue: mockPaginationProvider,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: getRepositoryToken(Workspace),
          useValue: mockWorkspaceRepository,
        },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const getWorkspacesFilterDto: GetWorkspacesFilterDto = {
      page: 1,
      limit: 10,
      type: WorkspaceType.OPEN_SPACE,
    };
    const cacheKey = 'workspaces_limit=10&page=1&type=open_space';
    const paginatedResult = {
      data: [],
      meta: { totalItems: 0 },
    };

    it('should return cached data if available', async () => {
      (mockCacheManager.get as jest.Mock).mockResolvedValue(paginatedResult);
      const result = await service.findAll(getWorkspacesFilterDto);
      expect(mockCacheManager.get).toHaveBeenCalledWith(cacheKey);
      expect(result).toEqual(paginatedResult);
      expect(mockWorkspaceRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should build query, paginate and cache result if no cached data', async () => {
      (mockCacheManager.get as jest.Mock).mockResolvedValue(undefined);
      (mockPaginationProvider.paginateQuery as jest.Mock).mockResolvedValue(
        paginatedResult,
      );
      const result = await service.findAll(getWorkspacesFilterDto);
      expect(mockWorkspaceRepository.createQueryBuilder).toHaveBeenCalledWith(
        'workspace',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'workspace.type = :type',
        { type: 'open_space' },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'workspace.createdAt',
        'DESC',
      );
      expect(mockPaginationProvider.paginateQuery).toHaveBeenCalledWith(
        getWorkspacesFilterDto.page,
        getWorkspacesFilterDto.limit,
        mockQueryBuilder,
      );
      expect(mockCacheManager.set).toHaveBeenCalledWith(cacheKey, result);
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findAvailableWorkspaecs', () => {
    const baseAvailableDto = {
      page: 1,
      limit: 10,
    };

    it('should throw error if startTime >= endTime', async () => {
      const availableDto = {
        ...baseAvailableDto,
        startTime: new Date('2026-05-09T10:00:00Z'),
        endTime: new Date('2026-05-09T09:00:00Z'),
      };

      await expect(
        service.findAvailableWorkspaces(availableDto),
      ).rejects.toThrow(new BadRequestException(INVALID_DATE_RANGE_ERROR));
    });

    it('should throw error if startTime is in past', async () => {
      const availableDto = {
        ...baseAvailableDto,
        startTime: new Date(Date.now() - 100000),
        endTime: new Date(),
      };

      await expect(
        service.findAvailableWorkspaces(availableDto),
      ).rejects.toThrow(new BadRequestException(PAST_TIME_ERROR));
    });

    it('should build complex leftJoin query and paginate if dates are valid', async () => {
      const availableDto = {
        ...baseAvailableDto,
        startTime: new Date(Date.now() + 100000),
        endTime: new Date(Date.now() + 200000),
      };
      const paginatedResult = {
        data: [{ id: 1 }],
        meta: { totalItems: 1 },
      };

      (mockPaginationProvider.paginateQuery as jest.Mock).mockResolvedValue(
        paginatedResult,
      );

      const result = await service.findAvailableWorkspaces(availableDto);

      expect(mockWorkspaceRepository.createQueryBuilder).toHaveBeenCalledWith(
        'workspace',
      );
      expect(mockQueryBuilder.leftJoin).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('booking.id IS NULL');
      expect(mockPaginationProvider.paginateQuery).toHaveBeenCalledWith(
        availableDto.page,
        availableDto.limit,
        mockQueryBuilder,
      );

      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findOneById', () => {
    it('should throw error if workspace is not found', async () => {
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOneById(1)).rejects.toThrow(
        new NotFoundException('Workspace with ID 1 not found'),
      );

      expect(mockWorkspaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should return workspace if found', async () => {
      const workspace = { id: 1 };
      (mockWorkspaceRepository.findOne as jest.Mock).mockResolvedValue(
        workspace,
      );

      const result = await service.findOneById(1);

      expect(mockWorkspaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(workspace);
    });
  });

  describe('create', () => {
    it('should create and save a new workspace', async () => {
      const createWorkspaceDto = {
        title: 'Test Workspace',
        pricePerHour: 10,
        capacity: 4,
        type: WorkspaceType.PRIVATE_OFFICE,
      };
      const workspace = { ...createWorkspaceDto, id: 1 };
      (mockWorkspaceRepository.create as jest.Mock).mockReturnValue(workspace);
      (mockWorkspaceRepository.save as jest.Mock).mockResolvedValue(workspace);
      const result = await service.create(createWorkspaceDto);
      expect(mockWorkspaceRepository.create).toHaveBeenCalledWith(
        createWorkspaceDto,
      );
      expect(mockWorkspaceRepository.save).toHaveBeenCalledWith(workspace);
      expect(result).toEqual(workspace);
    });
  });
});
