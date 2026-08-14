import { faker } from '@faker-js/faker';
import {
  CompanyEntity,
  CompanyStatus,
  Industry,
} from '../../../modules/company/company.entity';

type BuildCompanyInput = {
  name: string;
  status: CompanyStatus;
  industry?: Industry;
  lastContactedAt?: Date;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

const buildPhoneNumber = () =>
  `+1-${faker.string.numeric(3)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`;

const buildWebsite = (name: string) => {
  const suffix = '.example.com';
  const protocol = 'https://';
  const maxSlugLength = 255 - protocol.length - suffix.length;
  const slug = faker.helpers
    .slugify(name)
    .toLowerCase()
    .slice(0, maxSlugLength);

  return `${protocol}${slug}${suffix}`;
};

export const buildCompany = ({
  name,
  status,
  industry,
  lastContactedAt,
  email,
  phone,
  website,
}: BuildCompanyInput): Partial<CompanyEntity> => {
  const company: Partial<CompanyEntity> = {
    name,
    status,
  };

  if (email !== null) {
    company.email =
      email ?? faker.internet.email({ firstName: name.split(' ')[0] });
  }

  if (phone !== null) {
    company.phone = phone ?? buildPhoneNumber();
  }

  if (website !== null) {
    company.website = website ?? buildWebsite(name);
  }

  if (industry !== undefined) {
    company.industry = industry;
  }

  if (lastContactedAt !== undefined) {
    company.lastContactedAt = lastContactedAt;
  }

  return company;
};
