import { Expose } from 'class-transformer';

export class ContactResponseDto {
  @Expose()
  id: string;

  @Expose()
  companyId: string;

  @Expose()
  name: string;

  @Expose()
  email: string | null;

  @Expose()
  phone: string | null;

  @Expose()
  role: string | null;

  @Expose()
  createdAt: string;

  @Expose()
  updatedAt: string;
}
