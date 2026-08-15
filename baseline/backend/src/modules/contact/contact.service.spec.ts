import { HttpStatus } from '@nestjs/common';
import { BUSINESS_ERROR_CODES } from '../../common/errors/error-codes';
import { AppException } from '../../common/errors/app-exception';
import { ContactService } from './contact.service';

describe('ContactService', () => {
  const buildService = () => {
    const contactRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findWithFilter: jest.fn(),
      findOne: jest.fn(),
      merge: jest.fn(),
      softDelete: jest.fn(),
    };

    const companyService = {
      getCompanyById: jest.fn(),
    };

    return {
      service: new ContactService(
        contactRepository as never,
        companyService as never,
      ),
      contactRepository,
      companyService,
    };
  };

  it('returns ENTITY_NOT_FOUND when the contact is missing', async () => {
    // Verifies missing contacts return the not-found business error.
    const { service, contactRepository } = buildService();
    contactRepository.findOne.mockResolvedValue(null);

    await expect(service.getContactById('missing-contact')).rejects.toMatchObject(
      {
        status: HttpStatus.NOT_FOUND,
        response: {
          code: BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND,
          details: {
            resource: 'Contact',
            id: 'missing-contact',
          },
        },
      },
    );
  });

  it('fails when moving a contact to a missing company', async () => {
    // Verifies reassignment fails when the target company does not exist.
    const { service, contactRepository, companyService } = buildService();
    contactRepository.findOne.mockResolvedValue({
      id: 'contact-1',
      companyId: 'company-1',
      name: 'Contact One',
    });
    companyService.getCompanyById.mockRejectedValue(
      new AppException({
        statusCode: HttpStatus.NOT_FOUND,
        code: BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND,
        message: 'Company not found',
      }),
    );

    await expect(
      service.updateContact('contact-1', { companyId: 'company-2' }),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: {
        code: BUSINESS_ERROR_CODES.PARENT_NOT_FOUND,
        details: {
          resource: 'Company',
          id: 'company-2',
        },
      },
    });
    expect(contactRepository.save).not.toHaveBeenCalled();
  });

  it('saves the updated contact when the target company exists', async () => {
    // Verifies reassignment succeeds when the target company is valid.
    const { service, contactRepository, companyService } = buildService();
    const existingContact = {
      id: 'contact-2',
      companyId: 'company-1',
      role: 'User',
    };
    const mergedContact = {
      ...existingContact,
      companyId: 'company-3',
      role: 'Decision Maker',
    };

    contactRepository.findOne.mockResolvedValue(existingContact);
    companyService.getCompanyById.mockResolvedValue({ id: 'company-3' });
    contactRepository.merge.mockReturnValue(mergedContact);
    contactRepository.save.mockResolvedValue(mergedContact);

    await expect(
      service.updateContact('contact-2', {
        companyId: 'company-3',
        role: 'Decision Maker',
      }),
    ).resolves.toEqual(mergedContact);
  });
});
