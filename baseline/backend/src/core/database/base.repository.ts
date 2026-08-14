import { Repository, FindManyOptions, ObjectLiteral } from 'typeorm';
import {
  resolvePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';

export class BaseRepository<T extends ObjectLiteral> extends Repository<T> {
  /**
   * Execute a paginated query using standardized pagination utilities
   *
   * @param page The current page number (starts from 1)
   * @param limit The number of items per page
   * @param options Additional TypeORM query options
   */
  async paginate(
    page: number | string = 1,
    limit: number | string = 10,
    options?: FindManyOptions<T>,
  ) {
    const {
      page: validPage,
      pageSize: validLimit,
      skip,
      take,
    } = resolvePagination({
      page,
      pageSize: limit,
    });

    const [items, total] = await this.findAndCount({
      ...options,
      skip,
      take,
    });

    return buildPaginatedResult({
      items,
      total,
      page: validPage,
      pageSize: validLimit,
    });
  }
}
