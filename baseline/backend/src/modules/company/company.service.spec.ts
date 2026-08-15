import { HttpStatus } from '@nestjs/common';
import { BUSINESS_ERROR_CODES } from '../../common/errors/error-codes';
import { CompanyService } from './company.service';

describe('CompanyService', () => {
  const createQueryBuilder = () => ({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
  });

  const buildService = () => {
    const queryBuilder = createQueryBuilder();
    const companyRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findWithFilter: jest.fn(),
      findOne: jest.fn(),
      merge: jest.fn(),
      softDelete: jest.fn(),
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
    };

    return {
      service: new CompanyService(companyRepo as never),
      companyRepo,
      queryBuilder,
    };
  };

  it('returns ENTITY_NOT_FOUND when the company is missing', async () => {
    // Verifies missing companies return the not-found business error.
    const { service, companyRepo } = buildService();
    companyRepo.findOne.mockResolvedValue(null);

    await expect(service.getCompanyById('missing-id')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: {
        code: BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND,
        details: {
          resource: 'Company',
          id: 'missing-id',
        },
      },
    });
  });

  it('blocks delete when the company still has contacts', async () => {
    // Verifies delete is blocked when related contacts still exist.
    const { service, companyRepo, queryBuilder } = buildService();
    companyRepo.findOne.mockResolvedValue({ id: 'company-1' });
    queryBuilder.getCount.mockResolvedValue(2);

    await expect(service.removeCompany('company-1')).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: {
        code: BUSINESS_ERROR_CODES.REFERENTIAL_INTEGRITY_VIOLATION,
        details: {
          resource: 'Company',
          id: 'company-1',
          blockingChildren: {
            contacts: 2,
          },
        },
      },
    });
    expect(companyRepo.softDelete).not.toHaveBeenCalled();
  });

  it('soft deletes when the company has no contacts', async () => {
    // Verifies delete succeeds when no related contacts remain.
    const { service, companyRepo, queryBuilder } = buildService();
    companyRepo.findOne.mockResolvedValue({ id: 'company-2' });
    queryBuilder.getCount.mockResolvedValue(0);

    await service.removeCompany('company-2');

    expect(companyRepo.softDelete).toHaveBeenCalledWith('company-2');
  });
});
