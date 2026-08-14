import { faker } from '@faker-js/faker';
import { ContactEntity } from '../../../modules/contact/contact.entity';

type BuildContactInput = {
  companyId: string;
  name: string;
  lastContactedAt?: Date;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
};

const buildPhoneNumber = () =>
  `+1-${faker.string.numeric(3)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`;

export const buildContact = ({
  companyId,
  name,
  lastContactedAt,
  email,
  phone,
  role,
}: BuildContactInput): Partial<ContactEntity> => {
  const contact: Partial<ContactEntity> = {
    companyId,
    name,
  };

  if (email !== null) {
    contact.email =
      email ?? faker.internet.email({ firstName: name.split(' ')[0] });
  }

  if (phone !== null) {
    contact.phone = phone ?? buildPhoneNumber();
  }

  if (role !== null) {
    contact.role =
      role ??
      faker.helpers.arrayElement([
        'Decision Maker',
        'Champion',
        'Evaluator',
        'Procurement',
      ]);
  }

  if (lastContactedAt !== undefined) {
    contact.lastContactedAt = lastContactedAt;
  }

  return contact;
};
