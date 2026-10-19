import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  OneToOne,
  JoinColumn,
  ManyToOne,
  BeforeInsert,
  BeforeUpdate
} from 'typeorm';

import { Application } from 'src/applications/entities/applications.entity';
import { Company } from 'src/companies/entities/company.entity';

export enum Status {
  UNDER_CREDIT_REVIEW = 'under credit review',
  OPERATIONS = 'operations',
  PENDENCY_IN_FILE = 'pendency in file',
  FILE_SEND_TO_BANKER = 'file send to banker',
  FILE_SENT_TO_BANKER_AWAITING = 'file sent to banker - awaiting response',
  TO_BE_APPROVED = 'to be approved',
  TO_BE_DISBURSED = 'to be disbursed',
  APPROVED = 'approved',
  DISBURSED = 'disbursed',
  CARRY_FORWARD = 'carry forward',
  REJECTED = 'rejected',
  DROP = 'drop',
  HOLD = 'hold',
}

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company, (company) => company.tickets)
  @JoinColumn({ name: 'company_id', referencedColumnName: 'companyId' })
  company: Company;

  // Define customer_application_id as a foreign key with an index for fast lookups
  @Column()
  @Index()
  customer_application_id: number;

  @OneToOne(() => Application, (application) => application.ticket)
  @JoinColumn({ name: 'customer_application_id' }) // Specify the foreign key column name
  application: Application; // This will create the relationship with the Application entity

  @Column()
  @Index()
  user_id: number;

  @Column({ nullable: true })
  forwarded_to: number;

  @Column({ nullable: true })
  forwarded_by: number;

  @Column({
    type: 'tinyint',
    width: 1,          // Width 1 because it’s used as a boolean-like field
    default: 0,
  })
  is_forwarded: number;

  @Column()
  original_estimate: string;

  @Column({
    type: 'enum',
    enum: Status,
  })
  status: Status;

  @Column()
  voice_note_url: string;

  @Column({ type: 'date', nullable: true, default: null })
  due_date: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @Column({ type: 'date', nullable: true })
  disbursed_at: Date;

  @Column({ type: 'decimal', nullable: true })
  disbursed_amount: number;

  @Column({ type: 'date', nullable: true })
  approved_at: Date;

  @Column({ type: 'decimal', nullable: true })
  approved_amount: number;

  @Column({ type: 'decimal', nullable: true })
  cashback_amount: number;

  @Column({ type: 'decimal', nullable: true })
  fixed_commission_percentage: number;

  @Column({ name: 'case_type', type: 'enum', enum: ['top_up', 'fresh'], nullable: true })
  case_type: string;

  @BeforeInsert()
  setCreatedAt() {
    this.created_at = new Date();
    this.updated_at = new Date();
  }

  @BeforeUpdate()
  setUpdatedAt() {
    this.updated_at = new Date();
  }
}
