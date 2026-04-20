import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workspace } from './workspace.entity';
import { Repository } from 'typeorm';
import { CreateWorkspaceDto } from './dtos/create-workspace.dto';
import { GetWorkspacesFilterDto } from './dtos/get-workspaces-filter.dto';
import { PaginationProvider } from '../common/pagination/providers/pagination.provider';
import { Paginated } from '../common/pagination/interfaces/paginated.interface';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
    private readonly paginationProvider: PaginationProvider,
  ) {}

  async findAll(
    getWorkspacesFilterDto: GetWorkspacesFilterDto,
  ): Promise<Paginated<Workspace>> {
    const { page, limit, minPrice, minCapacity, type } = getWorkspacesFilterDto;
    const query = this.workspacesRepository.createQueryBuilder('workspace');

    if (minPrice) {
      query.andWhere('workspace.pricePerHour >= :minPrice', { minPrice });
    }

    if (minCapacity) {
      query.andWhere('workspace.capacity >= :minCapacity', { minCapacity });
    }

    if (type) {
      query.andWhere('workspace.type = :type', { type });
    }

    query.orderBy('workspace.createdAt', 'DESC');
    return this.paginationProvider.paginateQuery(page, limit, query);
  }

  async findOneById(id: number): Promise<Workspace> {
    const workspace = await this.workspacesRepository.findOne({
      where: { id },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID ${id} not found`);
    }
    return workspace;
  }

  async create(createWorkspaceDto: CreateWorkspaceDto): Promise<Workspace> {
    const workspace = this.workspacesRepository.create(createWorkspaceDto);
    return this.workspacesRepository.save(workspace);
  }
}
