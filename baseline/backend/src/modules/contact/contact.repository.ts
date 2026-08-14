import { Injectable } from '@nestjs/common';
import { DataSource, Brackets } from 'typeorm';
import { BaseRepository } from '../../core/database/base.repository';
import { ContactEntity } from './contact.entity';
import { ContactListQueryDto } from './dto';

@Injectable()
export class ContactRepository extends BaseRepository<ContactEntity> {
  constructor(private dataSource: DataSource) {
    super(ContactEntity, dataSource.createEntityManager());
  }

  async findWithFilter(query: ContactListQueryDto) {
    const queryBuilder = this.createQueryBuilder('contact');

    const sortField = query.sort
      ? `contact.${query.sort}`
      : 'contact.createdAt';
    const sortOrder = query.order ? query.order.toUpperCase() : 'DESC';
    queryBuilder.orderBy(sortField, sortOrder as 'ASC' | 'DESC');

    if (query.companyId) {
      queryBuilder.andWhere('contact.companyId = :companyId', {
        companyId: query.companyId,
      });
    }

    if (query.q) {
      const searchValue = `%${query.q}%`;
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('contact.name ILIKE :searchValue', { searchValue })
            .orWhere('contact.email ILIKE :searchValue', { searchValue })
            .orWhere('contact.phone ILIKE :searchValue', { searchValue })
            .orWhere('contact.role ILIKE :searchValue', { searchValue });
        }),
      );
    }

    if (query.role) {
      queryBuilder.andWhere('contact.role = :role', { role: query.role });
    }

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    return queryBuilder.skip(offset).take(limit).getManyAndCount();
  }
}
