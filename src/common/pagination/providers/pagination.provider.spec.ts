import { Test } from '@nestjs/testing';
import { PaginationProvider } from './pagination.provider';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

describe('PaginationProvider', () => {
  let provider: PaginationProvider;
  let mockSelectQueryBuilder: Partial<SelectQueryBuilder<ObjectLiteral>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSelectQueryBuilder = {
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [PaginationProvider],
    }).compile();

    provider = module.get<PaginationProvider>(PaginationProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('paginateQuery', () => {
    it('should paginate with default parameters: page=1, limit=10', async () => {
      const mockItems = [{ id: 1 }, { id: 2 }];
      const mockTotal = 5;

      mockSelectQueryBuilder.getManyAndCount = jest
        .fn()
        .mockResolvedValue([mockItems, mockTotal]);

      const result = await provider.paginateQuery(
        undefined,
        undefined,
        mockSelectQueryBuilder as SelectQueryBuilder<ObjectLiteral>,
      );

      expect(mockSelectQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockSelectQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(mockSelectQueryBuilder.getManyAndCount).toHaveBeenCalled();
      expect(result).toEqual({
        data: mockItems,
        meta: {
          totalItems: mockTotal,
          itemsPerPage: 10,
          totalPages: 1,
          currentPage: 1,
        },
      });
    });

    it('should paginate with custom parameters', async () => {
      const mockItems = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
      const mockTotal = 15;
      const page = 3;
      const limit = 5;

      mockSelectQueryBuilder.getManyAndCount = jest
        .fn()
        .mockResolvedValue([mockItems, mockTotal]);

      const result = await provider.paginateQuery(
        page,
        limit,
        mockSelectQueryBuilder as SelectQueryBuilder<ObjectLiteral>,
      );

      expect(mockSelectQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockSelectQueryBuilder.take).toHaveBeenCalledWith(5);
      expect(result).toEqual({
        data: mockItems,
        meta: {
          totalItems: mockTotal,
          itemsPerPage: limit,
          totalPages: 3,
          currentPage: page,
        },
      });
    });

    it('should calculate total pages correctly when items do not perfectly divide by limit', async () => {
      const mockItems = [{ id: 1 }];
      const mockTotal = 11;
      const page = 2;
      const limit = 10;

      mockSelectQueryBuilder.getManyAndCount = jest
        .fn()
        .mockResolvedValue([mockItems, mockTotal]);

      const result = await provider.paginateQuery(
        page,
        limit,
        mockSelectQueryBuilder as SelectQueryBuilder<ObjectLiteral>,
      );

      expect(result.meta.totalPages).toBe(2);
    });
  });
});
