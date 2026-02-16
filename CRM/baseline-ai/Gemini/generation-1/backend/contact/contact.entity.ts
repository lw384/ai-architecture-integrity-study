import { ContactStatus } from './contact.types';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  companyId?: string;
  status: ContactStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}