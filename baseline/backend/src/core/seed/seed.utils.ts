import { CompanyEntity } from '../../modules/company/company.entity';
import { ContactEntity } from '../../modules/contact/contact.entity';
import { SeedContext } from './seed.types';

export const daysAgo = (now: Date, days: number) => {
  const date = new Date(now);

  date.setDate(date.getDate() - days);

  return date;
};

export const distributeRecentDate = (
  now: Date,
  index: number,
  total: number,
) => {
  const safeTotal = Math.max(total - 1, 1);
  const offsetDays = Math.round((index / safeTotal) * 29);
  const date = daysAgo(now, offsetDays);

  date.setHours(9 + (index % 8), (index * 7) % 60, 0, 0);

  return date;
};

export const resetSeedTables = async ({ dataSource }: SeedContext) => {
  await dataSource.query(
    'TRUNCATE TABLE "contacts", "companies" RESTART IDENTITY CASCADE',
  );
};

export const cleanupCompaniesByPrefixes = async (
  { dataSource }: SeedContext,
  prefixes: string[],
) => {
  if (prefixes.length === 0) {
    return;
  }

  const companyRepository = dataSource.getRepository(CompanyEntity);
  const companies = await companyRepository
    .createQueryBuilder('company')
    .select('company.id', 'id')
    .where(
      prefixes
        .map((_, index) => `company.name LIKE :prefix${index}`)
        .join(' OR '),
      Object.fromEntries(
        prefixes.map((prefix, index) => [`prefix${index}`, `${prefix}%`]),
      ),
    )
    .getRawMany<{ id: string }>();

  if (companies.length === 0) {
    return;
  }

  await dataSource
    .getRepository(ContactEntity)
    .createQueryBuilder()
    .delete()
    .where('companyId IN (:...ids)', { ids: companies.map(({ id }) => id) })
    .execute();

  await companyRepository
    .createQueryBuilder()
    .delete()
    .where('id IN (:...ids)', { ids: companies.map(({ id }) => id) })
    .execute();
};
