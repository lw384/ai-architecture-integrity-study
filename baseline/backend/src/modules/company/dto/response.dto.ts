import { Exclude, Expose } from 'class-transformer';
import { CompanyStatus, Industry } from '../company.entity';

@Exclude() // This decorator ensures that ONLY properties marked with @Expose() are included in the final JSON response
export class CompanyResponseDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  phone: string;

  @Expose()
  status: CompanyStatus;

  @Expose()
  industry: Industry;

  @Expose()
  lastContactedAt: Date;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
