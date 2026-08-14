import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactDto, UpdateContactDto, ContactListQueryDto } from './dto';
import { createUuidV4Pipe } from '../../common/pipes/uuid-v4.pipe';

@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /**
   * Create a new contact
   * Endpoint: POST /contacts[cite: 1]
   */
  @Post()
  async create(@Body() createContactDto: CreateContactDto) {
    return await this.contactService.createContact(createContactDto);
  }

  /**
   * List contacts with pagination and filtering
   * Endpoint: GET /contacts[cite: 1]
   */
  @Get()
  async findAll(@Query() query: ContactListQueryDto) {
    return await this.contactService.getContactsList(query);
  }

  /**
   * Get a single contact by ID
   * Endpoint: GET /contacts/:id[cite: 1]
   * Note: ParseUUIDPipe enforces the 400 INVALID_UUID constraint[cite: 1]
   */
  @Get(':id')
  async findOne(@Param('id', createUuidV4Pipe()) id: string) {
    return await this.contactService.getContactById(id);
  }

  /**
   * Partial update of a contact
   * Endpoint: POST /contacts/:id[cite: 1]
   * Note: The specification deliberately uses POST for partial updates (The POST double role convention)[cite: 1].
   */
  @Post(':id')
  async update(
    @Param('id', createUuidV4Pipe()) id: string,
    @Body() updateContactDto: UpdateContactDto,
  ) {
    return await this.contactService.updateContact(id, updateContactDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', createUuidV4Pipe()) id: string): Promise<void> {
    return this.contactService.removeContact(id);
  }
}
