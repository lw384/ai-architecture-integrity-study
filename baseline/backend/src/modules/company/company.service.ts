import { HttpStatus, Injectable } from '@nestjs/common';
import { CompanyRepository } from './company.repository';
import { CreateCompanyDto } from './dto/create.dto';
import { UpdateCompanyDto } from './dto/update.dto';
import { CompanyListQueryDto } from './dto';
import { CompanyEntity } from './company.entity';
import { AppException } from '../../common/errors/app-exception';
import { BUSINESS_ERROR_CODES } from '../../common/errors/error-codes';

@Injectable()
export class CompanyService {
  constructor(private readonly companyRepo: CompanyRepository) {}

  /**
   * Create a new company
   */
  async createCompany(dto: CreateCompanyDto): Promise<CompanyEntity> {
    const newCompany = this.companyRepo.create(dto);
    return await this.companyRepo.save(newCompany);
  }

  /**
   * Get a paginated list of companies
   */
  async getCompanies(query: CompanyListQueryDto) {
    return await this.companyRepo.findWithFilter(query);
  }

  /**
   * Get company details by ID
   */
  async getCompanyById(id: string): Promise<CompanyEntity> {
    const company = await this.companyRepo.findOne({ where: { id } });

    if (!company) {
      throw new AppException({
        statusCode: HttpStatus.NOT_FOUND,
        code: BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND,
        message: `Company with ID ${id} not found`,
        details: {
          resource: 'Company',
          id,
        },
      });
    }

    return company;
  }

  /**
   * Partially update a company
   */
  async updateCompany(
    id: string,
    dto: UpdateCompanyDto,
  ): Promise<CompanyEntity> {
    // First, ensure the company exists
    const company = await this.getCompanyById(id);

    // Merge the new data into the existing entity and save
    const updatedCompany = this.companyRepo.merge(company, dto);
    return await this.companyRepo.save(updatedCompany);
  }

  /**
   * Delete a company when no active contacts remain
   */
  async removeCompany(id: string): Promise<void> {
    await this.getCompanyById(id);

    const activeContactCount = await this.companyRepo.manager
      .createQueryBuilder()
      .from('contacts', 'contact')
      .where('contact.companyId = :id', { id })
      .getCount();

    if (activeContactCount > 0) {
      throw new AppException({
        statusCode: HttpStatus.CONFLICT,
        code: BUSINESS_ERROR_CODES.REFERENTIAL_INTEGRITY_VIOLATION,
        message: 'Cannot delete company with existing contacts.',
        details: {
          resource: 'Company',
          id,
          blockingChildren: {
            contacts: activeContactCount,
          },
        },
      });
    }

    await this.companyRepo.softDelete(id);
  }
}
