import { PartialType } from '@nestjs/mapped-types';
// Note: If you are using Swagger, import PartialType from '@nestjs/swagger' instead
import { CreateCompanyDto } from './create.dto';

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {}
