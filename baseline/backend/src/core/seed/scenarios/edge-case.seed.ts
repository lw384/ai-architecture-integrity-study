import {
  CompanyEntity,
  CompanyStatus,
  Industry,
} from '../../../modules/company/company.entity';
import { ContactEntity } from '../../../modules/contact/contact.entity';
import { buildCompany } from '../factories/company.factory';
import { buildContact } from '../factories/contact.factory';
import { SeedScenario } from '../seed.types';
import {
  cleanupCompaniesByPrefixes,
  distributeRecentDate,
} from '../seed.utils';

const EDGE_PREFIX = 'Edge Seed Company';

const MAX_COMPANY_NAME = `${EDGE_PREFIX} Long Name ${'X'.repeat(225)}`.slice(
  0,
  255,
);
const MAX_CONTACT_ROLE = `Role-${'Y'.repeat(95)}`.slice(0, 100);

export const edgeCaseSeedScenario: SeedScenario = {
  name: 'edge-case',
  async run({ dataSource, now }) {
    const companyRepository = dataSource.getRepository(CompanyEntity);
    const contactRepository = dataSource.getRepository(ContactEntity);

    await cleanupCompaniesByPrefixes({ dataSource, now }, [EDGE_PREFIX]);

    const companies = [
      buildCompany({
        name: `${EDGE_PREFIX} 00 Empty Contacts`,
        status: CompanyStatus.PENDING,
        email: null,
        phone: null,
        website: null,
      }),
      buildCompany({
        name: `${EDGE_PREFIX} 01 Missing Fields`,
        status: CompanyStatus.INACTIVE,
        email: null,
        phone: null,
        website: null,
        lastContactedAt: distributeRecentDate(now, 1, 25),
      }),
      buildCompany({
        name: MAX_COMPANY_NAME,
        status: CompanyStatus.ACTIVE,
        industry: Industry.TECHNOLOGY,
        lastContactedAt: distributeRecentDate(now, 2, 25),
      }),
      ...Array.from({ length: 22 }, (_, index) =>
        buildCompany({
          name: `${EDGE_PREFIX} ${String(index + 2).padStart(2, '0')} ${['Alpha', 'Sort', 'Filter', 'Pagination'][index % 4]} ${String(index + 1).padStart(2, '0')}`,
          status: [
            CompanyStatus.ACTIVE,
            CompanyStatus.INACTIVE,
            CompanyStatus.PENDING,
          ][index % 3],
          industry: [
            Industry.FINANCE,
            Industry.MANUFACTURING,
            Industry.RETAIL,
            Industry.OTHER,
          ][index % 4],
          email:
            index % 5 === 0 ? null : `edge-company-${index + 1}@baseline.local`,
          phone:
            index % 6 === 0
              ? null
              : `+1-415-55${String(index).padStart(2, '0')}`,
          website:
            index % 7 === 0
              ? null
              : `https://edge-company-${index + 1}.baseline.local`,
          lastContactedAt: distributeRecentDate(now, index + 3, 25),
        }),
      ),
    ];

    const savedCompanies = await companyRepository.save(
      companies.map((company) => companyRepository.create(company)),
    );

    let contactsCreated = 0;

    for (const [companyIndex, company] of savedCompanies.entries()) {
      if (companyIndex === 0) {
        continue;
      }

      const contactsForCompany =
        companyIndex === 1 ? 1 : 1 + (companyIndex % 3);

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
              name:
                companyIndex === 2 && contactIndex === 0
                  ? `Contact ${'Z'.repeat(240)}`.slice(0, 255)
                  : `${['Alpha', 'Beta', 'Gamma', 'Omega'][contactIndex % 4]} Edge Contact ${companyIndex}-${contactIndex}`,
              email:
                contactIndex % 4 === 0
                  ? null
                  : `edge-contact-${companyIndex + 1}-${contactIndex + 1}@baseline.local`,
              phone:
                contactIndex % 5 === 0
                  ? null
                  : `+1-628-44${companyIndex}${contactIndex}`,
              role:
                companyIndex === 2 && contactIndex === 0
                  ? MAX_CONTACT_ROLE
                  : ['Evaluator', 'Technical Buyer', 'Influencer'][
                      contactIndex % 3
                    ],
              lastContactedAt:
                companyIndex % 6 === 0 && contactIndex === 0
                  ? undefined
                  : distributeRecentDate(now, companyIndex + contactIndex, 40),
            }),
          ),
        );
      }
    }

    return {
      scenario: 'edge-case',
      companiesCreated: savedCompanies.length,
      contactsCreated,
      notes: [
        'Includes one company with zero contacts for empty-state testing.',
        'Creates 25 companies to exercise pagination and sorting.',
        'Adds null fields and max-length values for form and table edge cases.',
      ],
    };
  },
};
