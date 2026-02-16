import { Contact } from './contact.entity';

export enum ContactStatus {
  LEAD = 'LEAD',
  CUSTOMER = 'CUSTOMER',
}

export interface CreateContactPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  companyId?: string;
}

export interface UpdateContactPayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  status?: ContactStatus;
}