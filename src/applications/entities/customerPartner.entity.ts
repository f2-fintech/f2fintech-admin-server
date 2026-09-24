import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
} from 'typeorm';

import { Customer } from './customer.entity';

@Entity('customer_partner')
export class CustomerPartner {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int' })
    customer_id: number;

    @Column({ type: 'int' })
    company_id: number;

    @Column({
        type: 'enum',
        enum: ['director', 'partner'],
    })
    role: 'director' | 'partner';

    @Column({ type: 'varchar', length: 255, nullable: true })
    name: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    email: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    aadhaar: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    pan: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    mobile: string;

    @ManyToOne(() => Customer, (customer) => customer.applications, { eager: false })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;
}
