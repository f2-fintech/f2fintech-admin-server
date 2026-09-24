import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    JoinColumn,
    OneToOne,
} from 'typeorm';

import { Customer } from './customer.entity';

@Entity('customer_info')
export class CustomerInfo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int' })
    customer_id: number;

    @Column({ type: 'varchar', length: 100, nullable: true })
    pan: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    aadhaar: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    mother_name: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    father_name: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    working_address: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    permanent_address: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    current_address: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    bank: string;

    @Column({
        type: 'enum',
        enum: ['current', 'savings', 'fixed deposit', 'recurring deposit']
    })
    bank_ac_type: 'current' | 'savings' | 'fixed deposit' | 'recurring deposit';

    @Column({
        type: 'enum',
        enum: ['salaried', 'business', 'professional', 'self_employed']
    })
    employment_type: 'salaried' | 'business' | 'professional' | 'self_employed';

    @Column({ type: 'varchar', length: 100, nullable: true })
    occupation: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    co_applicant_name: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    co_applicant_contact: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    co_applicant_email: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    co_applicant_mother_name: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    co_applicant_relation: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    co_applicant_employment_type: string;

    @Column({ type: 'int', nullable: true })
    salary: number;

    @Column({ type: 'int', nullable: true })
    existing_emi: number;

    @Column({ type: 'int', nullable: true })
    existing_liability: number;

    @Column({ type: 'bit', default: 0 })
    gst_registered: boolean;

    @Column({ type: 'bit', default: 0 })
    company_registered: boolean;

    @Column({ type: 'varchar', length: 100, nullable: true })
    company: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    company_official_email: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    gst_number: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    street: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    landmark: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    zipcode: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    city: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    state: string;

    @Column({ type: 'int' })
    referral_id: number;

    @OneToOne(() => Customer, (customer) => customer.info, { eager: false })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;
}
