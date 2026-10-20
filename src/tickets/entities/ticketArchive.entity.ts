// src/tickets/entities/ticketArchive.entity.ts
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    Index,
    OneToOne,
    JoinColumn,
    ManyToOne,
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

@Entity( 'ticket_archive' )
export class TicketArchive {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @Index()
    customer_application_id: number;

    @OneToOne( () => Application )
    @JoinColumn( { name: 'customer_application_id' } )
    application: Application;

    @Column()
    @Index()
    user_id: number;

    @Column()
    original_ticket_id: number;

    @Column( { nullable: true } )
    forwarded_to: number;

    @Column( { nullable: true } )
    forwarded_by: number;

    @Column( {
        type: 'tinyint',
        width: 1,
        default: 0,
    } )
    is_forwarded: number;

    @Column()
    original_estimate: string;

    @Column( {
        type: 'enum',
        enum: Status,
    } )
    status: Status;

    @Column()
    voice_note_url: string;

    @Column( { type: 'date', nullable: true } )
    due_date: Date;

    @Column( { type: 'timestamp' } )
    created_at: Date;

    @Column( { type: 'timestamp' } )
    updated_at: Date;

    @Column( { type: 'date', nullable: true } )
    disbursed_at: Date;

    @Column( { type: 'decimal', nullable: true } )
    disbursed_amount: number;

    @Column( { type: 'date', nullable: true } )
    approved_at: Date;

    @Column( { type: 'decimal', nullable: true } )
    approved_amount: number;

    @Column( { type: 'decimal', nullable: true } )
    cashback_amount: number;

    @Column( { type: 'decimal', nullable: true } )
    fixed_commission_percentage: number;

    @Column( { name: 'case_type', type: 'enum', enum: [ 'top_up', 'fresh' ], nullable: true } )
    case_type: string;

    @Column( { type: 'text', nullable: true } )
    reason_to_delete: string;

    @Column( { type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' } )
    archived_at: Date;

    @Column( { name: 'company_id' } )
    companyId: number;

    @ManyToOne( () => Company )
    @JoinColumn( { name: 'company_id', referencedColumnName: 'companyId' } )
    company: Company;

    @Column()
    @Index()
    archived_by: number;

}