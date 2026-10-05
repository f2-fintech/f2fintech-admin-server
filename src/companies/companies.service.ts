// company.service.ts

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

export interface CompanyResponse {
    companyId: number;
    name: string;
    email: string;
    contactNumber: string;
    website: string;
    address: string;
    description: string;
    isActive: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface PaginationResult {
    results: any[];
    count: number;
    pages: number;
}

@Injectable()
export class CompaniesService {
    constructor(
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
    ) { }

    private generateCompanyId(): number {
        // Generate a unique company ID (e.g., COMP-2024-00123)
        const timestamp = new Date().getTime().toString().slice(-6);
        return Number(timestamp);
    }

    private async generateUniqueCompanyId(): Promise<any> {
        let companyId: number;
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 5;

        while (!isUnique && attempts < maxAttempts) {
            companyId = this.generateCompanyId();

            // Check if this companyId already exists
            const existingCompany = await this.companyRepository.findOne({
                where: { companyId },
            });

            if (!existingCompany) {
                isUnique = true;
            }
            attempts++;
        }
    }

    // companies.service.ts - update the create method
    async create(createCompanyDto: CreateCompanyDto): Promise<any> {
        try {
            // Check if company with same name exists
            const existingCompany = await this.companyRepository.findOne({
                where: { name: createCompanyDto.name },
            });

            if (existingCompany) {
                return {
                    statusCode: 409,
                    message: 'Company with this name already exists.',
                };
            }
            const newCompany = this.companyRepository.create(createCompanyDto);
            const savedCompany = await this.companyRepository.save(newCompany);

            return {
                statusCode: 201,
                message: 'Company Created Successfully',
                data: savedCompany,
            };
        } catch (error) {
            console.error('Error creating company:', error); // Debug log
            return {
                statusCode: 500,
                message: 'Error Creating Company',
                error: error.message
            };
        }
    }

    async findAllCompanies(
        page: number,
        limit: number,
        name?: string,
        email?: string,
        contactNumber?: string,
        isActive?: number,
        startDate?: string,
        endDate?: string,
    ): Promise<PaginationResult> {
        page = Number(page) || 1;
        limit = Number(limit) || 10;
        const skip = (page - 1) * limit;

        const query = this.companyRepository.createQueryBuilder('companies')
            .skip(skip)
            .take(limit)
            .orderBy('companies.created_at', 'DESC');



        // Apply filters based on parameters
        if (name && name.trim() !== '') {
            query.andWhere('LOWER(companies.name) LIKE :name', {
                name: `%${name.toLowerCase()}%`
            });
        }

        if (email && email.trim() !== '') {
            query.andWhere('LOWER(companies.email) LIKE :email', {
                email: `%${email.toLowerCase()}%`
            });
        }

        if (contactNumber && contactNumber.trim() !== '') {
            query.andWhere('companies.contact_number LIKE :contactNumber', {
                contactNumber: `%${contactNumber}%`
            });
        }

        if (isActive !== undefined && isActive !== null) {
            query.andWhere('companies.is_active = :isActive', { isActive });
        }

        // Date range filtering - database agnostic approach
        // if ( startDate && endDate )
        // {
        //     const start = new Date( startDate );
        //     const end = new Date( endDate );
        //     end.setHours( 23, 59, 59, 999 );

        //     query.andWhere( 'companies.created_at BETWEEN :startDate AND :endDate', {
        //         startDate: start,
        //         endDate: end
        //     } );
        // } else if ( startDate )
        // {
        //     const start = new Date( startDate );
        //     query.andWhere( 'companies.created_at >= :startDate', { startDate: start } );
        // } else if ( endDate )
        // {
        //     const end = new Date( endDate );
        //     end.setHours( 23, 59, 59, 999 );
        //     query.andWhere( 'companies.created_at <= :endDate', { endDate: end } );
        // } else
        // {
        //     // Default to current month if no dates provided
        //     const now = new Date();
        //     const startOfMonth = new Date( now.getFullYear(), now.getMonth(), 1 );
        //     const endOfMonth = new Date( now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999 );

        //     query.andWhere( 'companies.created_at BETWEEN :startOfMonth AND :endOfMonth', {
        //         startOfMonth,
        //         endOfMonth
        //     } );
        // }

        const [companies, count] = await query.getManyAndCount();
        const results = companies.map((company) => ({
            id: company.id,
            companyId: company.companyId, // Include the custom companyId in response
            name: company.name,
            email: company.email,
            contactNumber: company.contactNumber,
            website: company.website,
            address: company.address,
            description: company.description,
            isActive: company.isActive,
            created_at: company.created_at,
            updated_at: company.updated_at,
        }));

        return {
            results,
            count,
            pages: Math.ceil(count / limit),
        };
    }

    async findOne(id: number): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { id } });
        if (!company) {
            throw new NotFoundException(`Company with ID ${id} not found`);
        }
        return company;
    }

    async findCompanyWithDetail(companyId: number): Promise<CompanyResponse> {
        const company = await this.companyRepository
            .createQueryBuilder('companies')
            .where('companies.id = :companyId', { companyId })
            .getOne();

        if (!company) {
            throw new NotFoundException(`Company with ID ${companyId} not found`);
        }

        return {
            companyId: company.id,
            name: company.name,
            email: company.email,
            contactNumber: company.contactNumber,
            website: company.website,
            address: company.address,
            description: company.description,
            isActive: company.isActive,
            created_at: company.created_at,
            updated_at: company.updated_at,
        };
    }

    async update(id: number, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
        const company = await this.findOne(id);

        // Check if name is being updated and conflicts with existing company
        if (updateCompanyDto.name && updateCompanyDto.name !== company.name) {
            const existingCompany = await this.companyRepository.findOne({
                where: { name: updateCompanyDto.name }
            });

            if (existingCompany && existingCompany.id !== id) {
                throw new ConflictException(`Company with name "${updateCompanyDto.name}" already exists`);
            }
        }

        Object.assign(company, updateCompanyDto, { updatedAt: new Date() });
        return await this.companyRepository.save(company);
    }

    async remove(companyId: number, reason: string, deletedByUserId: number): Promise<void> {
        const company = await this.companyRepository.findOne({ where: { id: companyId } });

        if (!company) {
            throw new Error('Company not found');
        }
        await this.companyRepository.remove(company);
    }

    async deactivateCompany(companyId: number): Promise<Company> {
        const company = await this.findOne(companyId);
        company.isActive = false;
        return await this.companyRepository.save(company);
    }

    async deactivateByCompanyId(companyId: number): Promise<Company> {
        const company = await this.companyRepository.findOne({ where: { companyId } });
        if (!company) {
            throw new NotFoundException(`Company with companyId ${companyId} not found`);
        }
        company.isActive = false;
        return await this.companyRepository.save(company);
    }

    async activateCompany(companyId: number): Promise<Company> {
        const company = await this.findOne(companyId);
        company.isActive = true;
        return await this.companyRepository.save(company);
    }
}