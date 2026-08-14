import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CompanyStatus, Industry } from '../company.entity';

export class CreateCompanyDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  email?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  phone?: string;

  @ValidateIf((object) => object.website !== '')
  @IsUrl()
  @MaxLength(255)
  @IsOptional()
  website?: string;

  @IsEnum(CompanyStatus)
  @IsOptional()
  status?: CompanyStatus;

  @IsEnum(Industry)
  @IsOptional()
  industry?: Industry;

  @IsOptional()
  lastContactedAt?: Date;
}
