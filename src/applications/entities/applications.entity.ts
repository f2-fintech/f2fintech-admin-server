import { Entity, Column, PrimaryGeneratedColumn, OneToOne, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';

import { Ticket } from 'src/tickets/entities/ticket.entity';
import { Customer } from './customer.entity';
import { LoanTracking } from './loanTracking.entity';
import { Company } from 'src/companies/entities/company.entity';

export enum Loan_type {
  TERM_LOAN = 'term loan',
  PERSONAL_LOAN = 'personal loan',
  BUSINESS_LOAN = 'business loan',
  PROFESSIONAL_LOAN = 'professional loan',
  HOME_LOAN = 'home loan',
  EDUCATION_LOAN = 'education loan',
  LAP = 'lap',
  MACHINERY_LOAN = 'machinery loan',
  AUTO_LOAN = 'auto loan',
  DOCTOR = 'doctor',
  CA_CS_CMA = 'ca_cs_cma'
}
export enum lead_type {
  NULL = 'null',
  NOTION = 'notion',
  DIALLER = 'dialler',
  FIELD_VISIT = 'field visit',
  SOURCER = 'sourcer',
  CHANNEL_PARTNER = 'channel partner',
  REF_FROM_CUSTOMER = 'ref from customer',
  LEFT_EMPLOYEE_FOLLOW_UP = 'left employee follow up'
}

export enum Loan_category {
  SECURED = 'secured',
  UNSECURED = 'unsecured'
}

@Entity('customer_application')
export class Application {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  customer_id: number;

  @Column({ type: 'int' })
  applied_by: number;

  @Column({ type: 'int' })
  application_no: number;

  @Column({ length: 500 })
  provider: string;

  @Column({ type: 'decimal' })
  amount: number;

  @Column({
    type: 'enum',
    enum: Loan_type,
  })
  loan_type: Loan_type;

  @Column({
    name: 'business_entity_type',
    type: 'enum',
    enum: ['sole_proprietorship', 'private_limited', 'llp', 'huf', 'partnership'],
    nullable: true,
  })
  business_entity_type: 'sole_proprietorship' | 'private_limited' | 'llp' | 'huf' | 'partnership';

  @Column({
    type: 'enum',
    enum: lead_type,
  })
  lead_type: lead_type;

  @Column({
    type: 'enum',
    enum: Loan_category,
  })
  loan_category: Loan_category;

  @Column({
    type: 'longtext',
    nullable: true,
  })
  existing_loans: string;

  @Column({ type: 'int' })
  tenure: number;

  @Column({ type: 'decimal' })
  interest_rate: number;

  @Column({ type: 'decimal' })
  emi_amount: number;

  @Column({ type: 'int' })
  emi_count: number;

  @Column({
    type: 'tinyint',
    width: 1,
    default: 0,
  })
  is_picked: number;

  @Column({ type: 'date' })
  application_date: Date;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({ name: 'company_id' })
  company_id: number;

  @ManyToOne(() => Company, (company) => company.applications)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  last_updated: Date;

  @Column({ name: 'case_type', type: 'enum', enum: ['top_up', 'fresh'], nullable: true })
  case_type: string;

  @OneToOne(() => Ticket, (ticket) => ticket.application)
  ticket: Ticket;

  @Column({ name: 'source', nullable: true })
  source: string;

  @ManyToOne(() => Customer, (customer) => customer.applications)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @OneToMany(() => LoanTracking, (tracking) => tracking.application)
  loanTracking: LoanTracking[];

  @Column({ name: 'aggregator_member_id', type: 'varchar', length: 255, nullable: true })
  aggregator_member_id: string;
}
