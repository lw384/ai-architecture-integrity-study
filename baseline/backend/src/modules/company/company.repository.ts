// src/modules/company/company.repository.ts
import { Injectable } from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { CompanyListQueryDto } from './dto';
import { BaseRepository } from '../../core/database/base.repository';
import {
  buildPaginatedResult,
  resolvePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class CompanyRepository extends BaseRepository<CompanyEntity> {
  constructor(dataSource: DataSource) {
    super(CompanyEntity, dataSource.createEntityManager());
  }

  async findWithFilter(query: CompanyListQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination({
      page: query.page,
      pageSize: query.pageSize,
    });

    const queryBuilder = this.createQueryBuilder('company');
    const searchTerm = query.q?.trim();

    if (searchTerm) {
      queryBuilder.andWhere(
        new Brackets((searchQuery) => {
          searchQuery
            .where('company.name ILIKE :searchTerm')
            .orWhere('company.email ILIKE :searchTerm')
            .orWhere('company.phone ILIKE :searchTerm');
        }),
        { searchTerm: `%${searchTerm}%` },
      );
    }

    if (query.status) {
      queryBuilder.andWhere('company.status = :status', {
        status: query.status,
      });
    }

    if (query.industry) {
      queryBuilder.andWhere('company.industry = :industry', {
        industry: query.industry,
      });
    }

    const [items, total] = await queryBuilder
      .orderBy('company.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return buildPaginatedResult({
      items,
      total,
      page,
      pageSize,
    });
  }
}
