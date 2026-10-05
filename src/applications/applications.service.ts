import { Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Brackets, Repository, In } from 'typeorm';

import { Application } from './entities/applications.entity';
import { LoanTracking } from 'src/applications/entities/loanTracking.entity';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { Customer } from './entities/customer.entity';
import { CustomerInfo } from './entities/customerInfo.entity';

export interface PaginationResult {
  results: any[];
  count: number;
  pages: number;
  errorMessage?: string;
}

@Injectable()
export class ApplicationsService {
  prisma: any;
  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(LoanTracking)
    private readonly loanTrackingRepository: Repository<LoanTracking>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerInfo)
    private readonly customerInfoRepository: Repository<CustomerInfo>,
  ) { }


  async getApplicationData(
    page: number,
    limit: number,
    appliedBy?: string,
    aggregatorMemberId?: string,
    searchTerm?: string,
    companyId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PaginationResult> {
    page = Number(page) || 1;
    limit = Number(limit) || 10;
    const skip = (page - 1) * limit;

    // Create query builder
    const queryBuilder = this.applicationRepository
      .createQueryBuilder('application')
      .leftJoinAndSelect('application.customer', 'customer')
      .leftJoinAndSelect('customer.info', 'info')
      .leftJoinAndSelect(
        'customer.customerDocuments',
        'documents',
        'documents.customer_id = customer.id'                     // explicit condition
      )
      .leftJoinAndSelect(
        'application.loanTracking',
        'loanTracking',
        'loanTracking.customer_application_id = application.id'   // explicit condition
      )
      .where('application.is_picked = :isPicked', { isPicked: 0 });

    if (companyId) {
      queryBuilder.andWhere('application.company_id = :company_id', { company_id: Number(companyId) });
    }

    // Add appliedBy condition if provided
    if (appliedBy) {
      if (typeof appliedBy === 'string' && appliedBy.includes(',')) {
        queryBuilder.andWhere('application.applied_by IN (:...appliedBy)', { appliedBy: appliedBy.split(',').map(Number) });
      } else {
        queryBuilder.andWhere('application.applied_by = :appliedBy', { appliedBy: Number(appliedBy) });
      }
    }

    // Add aggregatorMemberId condition if provided
    if (aggregatorMemberId) {
      queryBuilder.andWhere('application.aggregator_member_id = :aggregatorMemberId', { aggregatorMemberId });
    }

    // Add search conditions if searchTerm is provided
    if (searchTerm && searchTerm.trim() !== '') {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      queryBuilder.andWhere(
        new Brackets(qb => {
          qb.where('LOWER(customer.name) LIKE :search', { search: searchPattern })
            .orWhere('customer.contact LIKE :search', { search: searchPattern })
            .orWhere('info.pan LIKE :search', { search: searchPattern })
            .orWhere('CAST(application.application_no AS CHAR) LIKE :search', { search: searchPattern });
        })
      );
    }

    // Add date range filter if startDate or endDate provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('application.application_date BETWEEN :start AND :end', { start, end });
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('application.application_date >= :start', { start });
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('application.application_date <= :end', { end });
    } else {
      // Default to current month if no dates are provided, matching tickets behavior
      queryBuilder.andWhere('application.application_date >= DATE_FORMAT(NOW(), :startOfMonth)', {
        startOfMonth: '%Y-%m-01 00:00:00',
      });
      queryBuilder.andWhere('application.application_date <= DATE_FORMAT(LAST_DAY(NOW()), :endOfMonth)', {
        endOfMonth: '%Y-%m-%d 23:59:59',
      });
    }

    // Get results and count
    const [applications, totalCount] = await queryBuilder
      .orderBy('application.application_date', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Map results
    const results = applications.map((application) => {
      const { customer, loanTracking, amount, loan_category, provider, tenure, application_date, id } = application;

      return {
        customerId: customer?.id ?? 'No ID',
        customerName: customer?.name ?? 'No Name',
        customerEmail: customer?.email ?? 'No Email',
        customerContact: customer?.contact ?? 'No Contact',
        customerPAN: customer?.info?.pan ?? 'No PAN', // Add this line to verify PAN
        applicationProvider: provider ?? 'No provider available',
        applicationAmount: amount,
        loanCategory: loan_category,
        applicationTenure: tenure,
        applicationDate: application_date,
        applicationId: id,
        applicationNumber: application.application_no,
        loanType: application.loan_type,
        leadType: application.lead_type,
        loanStatus: loanTracking[0]?.status ?? 'No status available',
        customerDesignation: customer?.info?.employment_type ?? 'Not available',
        customerProfileImage: (customer?.customerDocuments ?? [])
          ?.filter(doc => doc.type === 'profile photo')
          .map(doc => doc.document_url) ?? ['No image available'],
        customerLocation: customer?.info?.city ?? 'No location available',
        customerState: customer?.info?.state ?? 'No location available',
        companyId: application.company_id ?? 'No company',
        existingLoans: application.existing_loans,
        source: application.source,
        appliedBy: application.applied_by ?? null,
      };
    });

    return {
      results,
      count: totalCount,
      pages: Math.ceil(totalCount / limit),
    };
  }

  private getMonthNumber(monthName: string): number {
    const months = {
      'January': 1, 'February': 2, 'March': 3, 'April': 4,
      'May': 5, 'June': 6, 'July': 7, 'August': 8,
      'September': 9, 'October': 10, 'November': 11, 'December': 12
    };
    return months[monthName] || 1;
  }

  async getApplicationsCount(month?: string, year?: number, date?: string, company_id?: string, appliedBy?: string): Promise<number> {
    const whereCondition: any = {};
    if (company_id) {
      whereCondition.company_id = Number(company_id);
    }

    // Filter by the user who applied (sales dashboard scoping)
    if (appliedBy) {
      if (typeof appliedBy === 'string' && appliedBy.includes(',')) {
        whereCondition.applied_by = In(appliedBy.split(',').map(Number));
      } else {
        whereCondition.applied_by = Number(appliedBy);
      }
    }

    if (date) {
      // Filter by exact date
      const parsedDate = new Date(date);
      const startOfDay = new Date(parsedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(parsedDate);
      endOfDay.setHours(23, 59, 59, 999);
      whereCondition.application_date = Between(startOfDay, endOfDay);

    } else if (month && year) {
      // Filter by month
      const monthNumber = this.getMonthNumber(month); // Ensure this returns 1-based index (Jan = 1)
      const startDate = new Date(year, monthNumber - 1, 1);
      const endDate = new Date(year, monthNumber, 0, 23, 59, 59, 999);
      whereCondition.application_date = Between(startDate, endDate);

    } else if (year) {
      // Filter by year
      const startDate = new Date(year, 0, 1, 0, 0, 0, 0);
      const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
      whereCondition.application_date = Between(startDate, endDate);
    }

    return Object.keys(whereCondition).length === 0
      ? this.applicationRepository.count({ where: appliedBy ? { applied_by: whereCondition.applied_by } : {} })
      : this.applicationRepository.count({ where: whereCondition });
  }


  async getNewApplicationsCount(month?: string, year?: number, date?: string, company_id?: string, appliedBy?: string): Promise<any> {
    const whereCondition: any = { is_picked: 0 };
    if (company_id) {
      whereCondition.company_id = Number(company_id);
    }

    // Scope to the specific sales user who filed the application
    if (appliedBy) {
      if (typeof appliedBy === 'string' && appliedBy.includes(',')) {
        whereCondition.applied_by = In(appliedBy.split(',').map(Number));
      } else {
        whereCondition.applied_by = Number(appliedBy);
      }
    }

    // If specific date is provided, filter by that exact date
    if (date) {
      const selectedDate = new Date(date);
      const startOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
      const endOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

      whereCondition.application_date = Between(startOfDay, endOfDay);
    }
    // If only month and year are provided (no specific date)
    else if (month && year) {
      const monthNumber = this.getMonthNumber(month);
      const startDate = new Date(year, monthNumber - 1, 1); // Start of month
      const endDate = new Date(year, monthNumber, 0, 23, 59, 59); // End of month

      whereCondition.application_date = Between(startDate, endDate);
    }
    // If only year is provided
    else if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      whereCondition.application_date = Between(startDate, endDate);
    }
    // Default to current month if no dates are provided
    else {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      whereCondition.application_date = Between(startDate, endDate);
    }

    return this.applicationRepository.count({
      where: whereCondition,
      order: { application_date: 'DESC' },
    });
  }

  async getNewApplicationsList(limit: number = 10, company_id?: string): Promise<any[]> {
    const whereCondition: any = { is_picked: 0 };
    if (company_id) {
      whereCondition.company_id = Number(company_id);
    }

    const applications = await this.applicationRepository.find({
      where: whereCondition,
      order: { application_date: 'DESC' },
      take: limit,
      relations: ['customer'],
    });

    return applications.map((app) => ({
      applicationId: app.id,
      applicationNo: app.application_no,
      customerName: app.customer?.name ?? 'Unknown',
      applicationDate: app.application_date,
      amount: app.amount,
      loanType: app.loan_type,
      provider: app.provider,
    }));
  }

  async getNewApplicationNotificationFormat(id: number): Promise<any> {
    const app = await this.applicationRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!app) return null;

    return {
      applicationId: app.id,
      applicationNo: app.application_no,
      customerName: app.customer?.name ?? 'Unknown',
      applicationDate: app.application_date,
      amount: app.amount,
      loanType: app.loan_type,
      provider: app.provider,
    };
  }

  async getApplicationById(id: number): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: ['customer', 'customer.info', 'customer.customerDocuments', 'loanTracking'],
    });

    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }
    return application;
  }

  async getCustomerFullDetails(customerId: number): Promise<any> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: ['info', 'customerDocuments', 'applications'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    return customer;
  }

  // Update an existing loan application
  async update(
    id: number,
    updateApplicationDto: UpdateApplicationDto,
  ): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: [
        'customer',
        'customer.info',
      ],
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    Object.assign(application, updateApplicationDto);

    // Update customer-related data
    if (updateApplicationDto.applicationAmount) {
      application.amount = updateApplicationDto.applicationAmount;
    }
    if (updateApplicationDto.customerName) {
      application.customer.name = updateApplicationDto.customerName;
    }
    if (updateApplicationDto.customerEmail) {
      application.customer.email = updateApplicationDto.customerEmail;
    }
    if (updateApplicationDto.customerContact) {
      application.customer.contact = updateApplicationDto.customerContact;
    }

    // Update customer info (e.g, city)
    if (updateApplicationDto.customerLocation) {
      application.customer.info.city = updateApplicationDto.customerLocation;
    }
    if (updateApplicationDto.customerState) {
      application.customer.info.state = updateApplicationDto.customerState;
    }
    // Update customer info (e.g, provider)
    // if ( updateApplicationDto.customerLocation )
    // {
    //   application.provider = updateApplicationDto.provider;
    // }
    if (updateApplicationDto.provider) {
      application.provider = updateApplicationDto.provider;
    }
    // Save the updated customer entity (this is crucial)
    await this.customerRepository.save(application.customer);

    // Save the updated customer info entity (this is crucial)
    await this.customerInfoRepository.save(application.customer.info);

    return this.applicationRepository.save(application); // Save updated entity to the database
  }

  public async fetchAllCustomerDocuments(customerId: number): Promise<any> {
    try {
      const documentUrl = `https://web.f2fintech.in/api/v1/get-customer-documents/${customerId}`;
      const documentResponse = await firstValueFrom(
        this.httpService.get(documentUrl),
      );

      return documentResponse.data.data;
    } catch (error) {
      console.error(
        `Error fetching customer document for ID ${customerId}:`,
        error.message,
      );

      return null;
    }
  }

  public async fetchCustomerDocument(customerId: number): Promise<any> {
    try {
      const documentUrl = `https://web.f2fintech.in/api/v1/get-customer-document/${customerId}`;
      const documentResponse = await firstValueFrom(
        this.httpService.get(documentUrl),
      );
      return documentResponse.data.data;
    } catch (error) {
      console.error(
        `Error fetching customer document for ID ${customerId}:`,
        error.message,
      );
      return null;
    }
  }

  async remove(applicationId: number): Promise<void> {
    try {
      // First check if the application exists
      const application = await this.applicationRepository.findOne({
        where: { id: applicationId }
      });

      if (!application) {
        throw new NotFoundException(`Application with ID ${applicationId} not found`);
      }
      // Find the loan tracking record
      const loanTracking = await this.loanTrackingRepository.findOne({
        where: { customer_application_id: applicationId }
      });

      // Delete loan tracking first (if it exists) to avoid foreign key constraint issues
      if (loanTracking) {
        await this.loanTrackingRepository.remove(loanTracking);
      }
      // Then delete the application
      await this.applicationRepository.remove(application);

    } catch (error) {
      console.error(`Error deleting application ${applicationId}:`, error);
      throw error; // Let the controller handle the error response
    }
  }
}
