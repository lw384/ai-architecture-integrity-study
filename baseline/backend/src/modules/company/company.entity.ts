import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum CompanyStatus {
  ACTIVE = '1',
  INACTIVE = '0',
  PENDING = '2',
}

export enum Industry {
  TECHNOLOGY = 'TECHNOLOGY',
  FINANCE = 'FINANCE',
  MANUFACTURING = 'MANUFACTURING',
  RETAIL = 'RETAIL',
  OTHER = 'OTHER',
}

@Entity('companies')
export class CompanyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, comment: 'Company Name' })
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Company Email Address',
  })
  email: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Contact Phone Number',
  })
  phone: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Company Website',
  })
  website: string;

  @Column({
    type: 'enum',
    enum: CompanyStatus,
    default: CompanyStatus.PENDING,
    comment: 'Company Status',
  })
  status: CompanyStatus;

  @Column({
    type: 'enum',
    enum: Industry,
    nullable: true,
    comment: 'Associated Industry',
  })
  industry: Industry;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last Contacted At (for projection)',
  })
  lastContactedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', comment: 'Creation Timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', comment: 'Update Timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
    select: false,
    comment: 'Soft Delete Timestamp',
  })
  deletedAt: Date;
}
