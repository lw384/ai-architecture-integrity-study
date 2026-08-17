import {
  IsString,
  IsEmail,
  IsOptional,
  IsUUID,
  IsDate,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContactDto {
  @IsUUID('4', { message: 'companyId must be a valid UUID' })
  companyId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsEmail({}, { message: 'Email format is incorrect' })
  email: string;

  @IsString()
  @MaxLength(50)
  phone: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  role?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastContactedAt?: Date;
}
