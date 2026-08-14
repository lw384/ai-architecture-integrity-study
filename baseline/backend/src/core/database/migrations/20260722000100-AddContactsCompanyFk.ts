import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactsCompanyFk20260722000100 implements MigrationInterface {
  name = 'AddContactsCompanyFk20260722000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contacts"
      ADD CONSTRAINT "fk_contacts_company_id"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_contacts_company_id"
      ON "contacts" ("companyId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "idx_contacts_company_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "contacts"
      DROP CONSTRAINT "fk_contacts_company_id"
    `);
  }
}
