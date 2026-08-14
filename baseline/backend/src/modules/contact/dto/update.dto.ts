import { PartialType } from '@nestjs/mapped-types';
import { CreateContactDto } from './create.dto';

export class UpdateContactDto extends PartialType(CreateContactDto) {}