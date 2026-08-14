import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('contacts')
export class ContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  companyId!: string;

  @Column({ type: 'varchar', length: 255, comment: 'Contact Name' })
  name!: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Contact Email',
  })
  email!: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Contact Phone Number',
  })
  phone!: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Contact Role',
  })
  role!: string;

  @CreateDateColumn({ type: 'timestamptz', comment: 'Creation Timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', comment: 'Update Timestamp' })
  updatedAt!: Date;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
    select: false,
    comment: 'Soft Delete Timestamp',
  })
  deletedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Last Contacted At' })
  lastContactedAt!: Date;
}
