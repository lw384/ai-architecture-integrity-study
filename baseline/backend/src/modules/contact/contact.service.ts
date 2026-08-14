import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ContactRepository } from './contact.repository';
import { CreateContactDto, UpdateContactDto, ContactListQueryDto } from './dto';
import { ContactEntity } from './contact.entity';
import { CompanyService } from '../company/company.module';
import { AppException } from '../../common/errors/app-exception';
import { BUSINESS_ERROR_CODES } from '../../common/errors/error-codes';

@Injectable()
export class ContactService {
  constructor(
    private readonly contactRepository: ContactRepository,
    private readonly companyService: CompanyService,
  ) {}

  /**
   * create a new contact
   */
  async createContact(dto: CreateContactDto): Promise<ContactEntity> {
    try {
      await this.companyService.getCompanyById(dto.companyId);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        throw new AppException({
          statusCode: HttpStatus.NOT_FOUND,
          code: BUSINESS_ERROR_CODES.PARENT_NOT_FOUND,
          message: `Company with ID ${dto.companyId} not found`,
          details: {
            resource: 'Company',
            id: dto.companyId,
          },
        });
      }

      throw error;
    }

    const contact = this.contactRepository.create(dto);
    return await this.contactRepository.save(contact);
  }

  /**
   * get contacts list
   */
  async getContactsList(query: ContactListQueryDto) {
    const [items, total] = await this.contactRepository.findWithFilter(query);

    const limit = query.pageSize ?? 20;
    const page = query.page ?? 1;

    return {
      items,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   *  get detailed contact information
   */
  async getContactById(id: string): Promise<ContactEntity> {
    const contact = await this.contactRepository.findOne({ where: { id } });

    if (!contact) {
      throw new AppException({
        statusCode: HttpStatus.NOT_FOUND,
        code: BUSINESS_ERROR_CODES.ENTITY_NOT_FOUND,
        message: `Contact with ID ${id} not found`,
        details: {
          resource: 'Contact',
          id,
        },
      });
    }

    return contact;
  }

  /**
   * update a contact
   */
  async updateContact(
    id: string,
    dto: UpdateContactDto & { companyId?: string },
  ): Promise<ContactEntity> {
    // ensure the contact exists
    const contact = await this.getContactById(id);

    if (dto.companyId && dto.companyId !== contact.companyId) {
      try {
        await this.companyService.getCompanyById(dto.companyId);
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 404) {
          throw new AppException({
            statusCode: HttpStatus.NOT_FOUND,
            code: BUSINESS_ERROR_CODES.PARENT_NOT_FOUND,
            message: `Company with ID ${dto.companyId} not found`,
            details: {
              resource: 'Company',
              id: dto.companyId,
            },
          });
        }

        throw error;
      }
    }

    const updatedContact = this.contactRepository.merge(contact, dto);

    return await this.contactRepository.save(updatedContact);
  }

  /**
   * soft delete a contact
   */
  async removeContact(id: string): Promise<void> {
    await this.getContactById(id);
    await this.contactRepository.softDelete(id);
  }

  async findWithCompany(id: string) {
    const contact = await this.getContactById(id);
    const company = await this.companyService.getCompanyById(contact.companyId);
    return { ...contact, company };
  }
}
