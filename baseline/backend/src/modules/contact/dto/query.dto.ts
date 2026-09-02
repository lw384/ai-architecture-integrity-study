import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsDate,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ContactSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ContactListQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'companyId must be a valid UUID' })
  companyId?: string;

  @IsOptional()
  @IsEnum(ContactSortField)
  sort?: ContactSortField = ContactSortField.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastContactedAt?: Date;

  get offset(): number {
    return ((this.page || 1) - 1) * (this.pageSize || 10);
  }

  // Calculate the limit (take).
  get limit(): number {
    return this.pageSize || 10;
  }
}
