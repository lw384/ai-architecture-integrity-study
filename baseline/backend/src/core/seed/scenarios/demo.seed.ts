import { faker } from '@faker-js/faker';
import {
  CompanyEntity,
  CompanyStatus,
  Industry,
} from '../../../modules/company/company.entity';
import { ContactEntity } from '../../../modules/contact/contact.entity';
import { buildCompany } from '../factories/company.factory';
import { buildContact } from '../factories/contact.factory';
import { SeedContext, SeedScenario } from '../seed.types';
import {
  cleanupCompaniesByPrefixes,
  distributeRecentDate,
} from '../seed.utils';

const DEMO_PREFIX = 'Demo Seed Company';
const STATUSES = [
  CompanyStatus.ACTIVE,
  CompanyStatus.INACTIVE,
  CompanyStatus.PENDING,
] as const;
const INDUSTRIES = [
  Industry.TECHNOLOGY,
  Industry.FINANCE,
  Industry.MANUFACTURING,
  Industry.RETAIL,
  Industry.OTHER,
] as const;

const createDemoCompanies = async ({ dataSource, now }: SeedContext) => {
  const companyRepository = dataSource.getRepository(CompanyEntity);
  const contactRepository = dataSource.getRepository(ContactEntity);
  let contactsCreated = 0;

  await cleanupCompaniesByPrefixes({ dataSource, now }, [DEMO_PREFIX]);

  for (let companyIndex = 0; companyIndex < 10; companyIndex += 1) {
    const companyName = `${DEMO_PREFIX} ${String(companyIndex + 1).padStart(2, '0')}`;
    const company = await companyRepository.save(
      companyRepository.create(
        buildCompany({
          name: companyName,
          status: STATUSES[companyIndex % STATUSES.length],
          industry: INDUSTRIES[companyIndex % INDUSTRIES.length],
          lastContactedAt: distributeRecentDate(now, companyIndex, 10),
          email: `demo-company-${companyIndex + 1}@baseline.local`,
        }),
      ),
    );

    const contactsForCompany = 2 + (companyIndex % 4);

    for (
      let contactIndex = 0;
      contactIndex < contactsForCompany;
      contactIndex += 1
    ) {
      contactsCreated += 1;

      await contactRepository.save(
        contactRepository.create(
          buildContact({
            companyId: company.id,
            name: faker.person.fullName(),
            lastContactedAt: distributeRecentDate(
              now,
              companyIndex + contactIndex,
              14,
            ),
            email: `demo-contact-${companyIndex + 1}-${contactIndex + 1}@baseline.local`,
            role: [
              'Decision Maker',
              'User',
              'Finance Reviewer',
              'Technical Buyer',
            ][contactIndex % 4],
          }),
        ),
      );
    }
  }

  return contactsCreated;
};

export const demoSeedScenario: SeedScenario = {
  name: 'demo',
  async run(context) {
    faker.seed(20260703);

    const contactsCreated = await createDemoCompanies(context);

    return {
      scenario: 'demo',
      companiesCreated: 10,
      contactsCreated,
      notes: [
        'Creates 10 companies with 2-5 contacts each.',
        'Cycles company status through ACTIVE, INACTIVE, and PENDING.',
        'Distributes lastContactedAt timestamps across the last 30 days.',
      ],
    };
  },
};
