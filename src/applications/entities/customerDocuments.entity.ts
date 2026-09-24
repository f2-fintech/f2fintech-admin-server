import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';

import { Customer } from './customer.entity';

@Entity( 'customer_document' )
export class CustomerDocument {
    @PrimaryGeneratedColumn()
    id: number;

    @Column( { type: 'int' } )
    customer_id: number;

    @Column( { type: 'text' } )
    document_url: string;

    @CreateDateColumn( { type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' } )
    created_at: Date;

    @Column( {
        type: 'enum',
        enum: [ 'aadhaar front','aadhaar back','pancard','bank statement','form 16','itr','salary slip','computation of income','financials','udhyam certificate','gst','form 26 as','list of directors','list of shareholders','aoa','moa','company pan','directors kyc','partnership deed','ug certificate','pg certificate','registration','photo','profile photo','certificate','audio','current address proof','cop','com','firm card','cancel cheque','company id card','co-applicant aadhaar front','co-applicant aadhaar back','co-applicant pan','marksheet 10','marksheet 12','graduation marksheet','offer letter','fee structure','entrance exam result','property papers','seller kyc','allotment letter','title deed','board resolution','mca report','coi','ptm','tpa','project noc','lod','ats','electricity bill','utility bill','ownership proof','share holding pattern','letter head','huf deed' ],
    } )
    type: 'aadhaar front' | 'aadhaar back' | 'pancard' | 'bank statement' | 'form 16' | 'itr' | 'salary slip' | 'computation of income' | 'financials' | 'udhyam certificate' | 'gst' | 'form 26 as' | 'list of directors' | 'list of shareholders' | 'aoa' | 'moa' | 'company pan' | 'directors kyc' | 'partnership deed' | 'ug certificate' | 'pg certificate' | 'registration' | 'photo' | 'profile photo' | 'certificate' | 'audio' | 'current address proof' | 'cop' | 'com' | 'firm card' | 'cancel cheque' | 'company id card' | 'co-applicant aadhaar front' | 'co-applicant aadhaar back' | 'co-applicant pan' | 'marksheet 10' | 'marksheet 12' | 'graduation marksheet' | 'offer letter' | 'fee structure' | 'entrance exam result' | 'property papers' | 'seller kyc' | 'allotment letter' | 'title deed' | 'board resolution' | 'mca report' | 'coi' | 'ptm' | 'tpa' | 'project noc' | 'lod' | 'ats' | 'electricity bill' | 'utility bill' | 'ownership proof' | 'share holding pattern' | 'letter head' | 'huf deed';

    @Column({ type: 'varchar', length: 255, nullable: true })
    pdf_password: string;

    @ManyToOne( () => Customer, ( customer ) => customer.customerDocuments, { eager: false } )
    @JoinColumn( { name: 'customer_id' } )
    customer: Customer;
}
