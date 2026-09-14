import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import { TicketHistory } from 'src/ticket_history/entities/ticket_history.entity';
import { TicketLog } from 'src/ticket_log/entities/ticket_log.entity';
import { TicketActivity } from 'src/ticket_activities/entities/ticket_activities.entity';
import { LoanTracking } from 'src/applications/entities/loanTracking.entity';
import { Application } from 'src/applications/entities/applications.entity';
import { TicketArchive } from './entities/ticketArchive.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TeamsService } from 'src/teams/teams.service';

export interface TicketResponse {
  ticketId: number | string;
  userId: number | string;
  employeeStatus: string;
  disbursed_at: Date | string;
  disbursed_amount: number | string;
  approved_at: Date | string;
  approved_amount: number | string;
  cashback_amount: number | string;
  voiceNoteUrl: string;
  forwardedTo: number | string;
  isForwarded: number | string;
  originalEstimate: string;
  provider: string;
  applicationAmount: string | number;
  applicationTenure: number | string;
  applicationDate: Date | string;
  applicationId: number | string;
  customerId: number | string;
  customerName: string;
  customerEmail: string;
  customerContact: string;
  customerDocuments: {
    id: number;
    type: string;
    document_url: string;
  }[];
  customerLocation: string;
  customerState: string;
  customerDesignation: string;
  loanStatus: string;
  loanCategory: string;
  loanType: string;
  case_type: string;
  fixed_commission_percentage: number | string;
  companyId: number;
  applicationSource: string;
  source?: string;
  due_date: Date | string | null;
  co_applicant_name?: string;
  co_applicant_contact?: string;
  co_applicant_email?: string;
  co_applicant_mother_name?: string;
  customerPAN?: string;
  appliedBy?: number | null;
  appliedByName?: string;
  managerName?: string;
}

export interface PaginationResult {
  results: any[];
  count: number;
  pages: number;
  totalDisbursedAmount?: number;
  errorMessage?: string;
}

@Injectable()
export class TicketsService {
  private readonly COMMISSION_WEBHOOK_URL =
    process.env.COMMISSION_WEBHOOK_URL || 'http://localhost:4000/graphql';
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 2000;

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketArchive)
    private readonly ticketArchiveRepository: Repository<TicketArchive>,
    @InjectRepository(TicketHistory)
    private readonly ticketHistoryRepository: Repository<TicketHistory>,
    @InjectRepository(TicketLog)
    private readonly ticketLogRepository: Repository<TicketLog>,
    @InjectRepository(TicketActivity)
    private readonly ticketActivityRepository: Repository<TicketActivity>,
    @InjectRepository(LoanTracking)
    private readonly loanTrackingRepository: Repository<LoanTracking>,
    @InjectRepository(Application)
    private readonly customerApplicationRepository: Repository<Application>,
    private readonly httpService: HttpService,
    private readonly notificationsService: NotificationsService,
    private readonly teamsService: TeamsService,
  ) { }

  async create(createTicketDto: CreateTicketDto, companyId?: number): Promise<any> {
    try {
      // Fetch the application first to check its exists and whether it's already picked
      const appResult = await this.customerApplicationRepository.createQueryBuilder('app')
        .select(['app.id', 'app.case_type', 'app.is_picked'])
        .where('app.id = :id', { id: createTicketDto.customer_application_id })
        .getOne();

      const existingTicket = await this.ticketRepository.findOne({
        where: { customer_application_id: createTicketDto.customer_application_id },
      });

      if (existingTicket || (appResult && Number(appResult.is_picked) === 1)) {
        return {
          statusCode: 409,
          message: 'This Application Is Already Picked By Another User.',
        };
      }

      // Create the ticket instance
      const newTicket = new Ticket();
      Object.assign(newTicket, createTicketDto);

      if (companyId !== null && companyId !== undefined) {
        newTicket.companyId = companyId;
      }

      if (appResult) {
        console.log('SYNC DEBUG: Found app ID:', appResult.id, 'Raw Case Type:', appResult.case_type);
        newTicket.case_type = appResult.case_type;
      } else {
        console.log('SYNC DEBUG: Application NOT found for ID:', createTicketDto.customer_application_id);
      }

      const savedTicket = await this.ticketRepository.save(newTicket);
      console.log('SYNC DEBUG: Saved ticket with case_type:', savedTicket.case_type);

      // Atomically mark application as picked in DB immediately
      await this.customerApplicationRepository.update(createTicketDto.customer_application_id, {
        is_picked: 1,
      });

      return {
        statusCode: 201,
        message: 'Ticket Created Successfully',
        data: savedTicket,
      };
    } catch (error) {
      return {
        statusCode: 500,
        message: 'Error Creating Ticket',
        error
      };
    }
  }

  async findAllTickets(
    page: number,
    limit: number,
    userId?: string | number,
    aggregatorMemberId?: string,
    appliedBy?: string,
    status?: string,
    provider?: string,
    name?: string,
    startDate?: string,
    endDate?: string,
    companyId?: number,
    teamUserIds?: number[],
  ): Promise<PaginationResult> {
    page = Number(page) || 1;
    limit = Number(limit) || 10;
    const skip = (page - 1) * limit;

    const query = this.ticketRepository.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.application', 'application') // Join application
      .leftJoinAndSelect('application.customer', 'customer') // Join customer
      .leftJoinAndSelect('customer.info', 'info') // Join customer info
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
      .skip(skip)
      .take(limit)
      .orderBy('ticket.created_at', 'DESC');

    if (companyId) {
      query.andWhere('ticket.companyId = :companyId', { companyId });
    }

    // Apply filters based on parameters
    if (userId) {
      if (appliedBy === 'sales') {
        // Special case: check application.applied_by instead of ticket.user_id
        if (String(userId).includes(',')) {
          const userIdsArray = String(userId).split(',').map(id => Number(id));
          query.andWhere('application.applied_by IN (:...userIdsArray)', { userIdsArray });
        } else {
          query.andWhere('application.applied_by = :userId', { userId });
        }

        // Apply status filter if provided and not 'all'
        if (status && status !== 'all' && status.trim() !== '') {
          query.andWhere('ticket.status = :status', { status });
        }
      } else {
        if (status === 'forwardedtome') {
          // Tickets forwarded to me
          query
            .andWhere('ticket.is_forwarded = :isForwarded', { isForwarded: 1 })
            .andWhere('ticket.forwarded_to = :userId', { userId });
        } else if (status === 'forwardedbyme') {
          // Tickets forwarded by me
          query
            .andWhere('ticket.is_forwarded = :isForwarded', { isForwarded: 1 })
            .andWhere('ticket.forwarded_by = :userId', { userId });
        } else {
          // All other statuses, e.g. "under credit review", "to be login", etc.
          if (status === 'forwarded') {
            // OPTIONAL: if you still want a plain "forwarded" status 
            // that means "either forwarded to me OR forwarded by me":
            query
              .andWhere('ticket.is_forwarded = :isForwarded', { isForwarded: 1 })
              .andWhere(
                new Brackets((qb) => {
                  qb.where('ticket.forwarded_to = :userId', { userId })
                    .orWhere('ticket.forwarded_by = :userId', { userId });
                }),
              );
          } else {
            // Normal userId + status check
            if (teamUserIds && teamUserIds.length > 0) {
              // Filtering by team instead of a single user
              query.andWhere('ticket.user_id IN (:...teamUserIds)', { teamUserIds });
            } else {
              if (String(userId).includes(',')) {
                const userIdsArray = String(userId).split(',').map(id => Number(id));
                query.andWhere('ticket.user_id IN (:...userIdsArray)', { userIdsArray });
              } else {
                query.andWhere('ticket.user_id = :userId', { userId });
              }
            }

            // Apply status filter if provided and not 'all'
            if (status && status !== 'all' && status.trim() !== '') {
              query.andWhere('ticket.status = :status', { status });
            }
          }
        }
      }
    } else if (aggregatorMemberId) {
      if (appliedBy === 'sales') {
        // Special case: check application.aggregator_member_id instead of ticket.user_id
        query.andWhere('application.aggregator_member_id = :aggregatorMemberId', { aggregatorMemberId });
      }
      // Apply status filter if provided and not 'all'
      if (status && status !== 'all' && status.trim() !== '') {
        query.andWhere('ticket.status = :status', { status });
      }
    } else if (status && status !== 'all' && status.trim() !== '') {
      // If no userId but we do have a status
      query.andWhere('ticket.status = :status', { status });
    }

    // Apply provider filter (works for both userId and admin)
    if (provider && provider !== 'all' && provider.trim() !== '') {
      query.andWhere('LOWER(application.provider) LIKE LOWER(:provider)', { provider: `%${provider}%` });
    }

    if (name && name.trim() !== '') {
      const searchTerm = name.trim();
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(customer.name) LIKE :name', { name: `%${searchTerm.toLowerCase()}%` })
            .orWhere('LOWER(customer.contact) LIKE :name', { name: `%${searchTerm.toLowerCase()}%` })
            .orWhere('LOWER(info.pan) LIKE :name', { name: `%${searchTerm.toLowerCase()}%` });
          if (!isNaN(Number(searchTerm))) {
            qb.orWhere('ticket.id = :ticketId', { ticketId: Number(searchTerm) });
          }
        }),
      );
    }

    const startOfMonthExpr = `DATE_SUB(CURDATE(), INTERVAL (DAYOFMONTH(CURDATE()) - 1) DAY)`;
    const endOfMonthExpr = `DATE_ADD(DATE_SUB(CURDATE(), INTERVAL (DAYOFMONTH(CURDATE()) - 1) DAY), INTERVAL 1 MONTH)`;

    if (startDate === 'all') {
      // Bypass date filter completely
    } else if (!startDate && !endDate && (!name || name.trim() === '')) {
      // Default to current month only if no search term and no specific dates are provided
      query.andWhere('ticket.created_at >= DATE_FORMAT(NOW(), :startOfMonth)', {
        startOfMonth: '%Y-%m-01 00:00:00',
      });
      query.andWhere('ticket.created_at <= DATE_FORMAT(LAST_DAY(NOW()), :endOfMonth)', {
        endOfMonth: '%Y-%m-%d 23:59:59',
      });
    } else {
      // Apply provided startDate and endDate if available
      if (status !== 'disbursed' && startDate && startDate !== 'all') {
        const parsedStartDate = `${startDate.substring(0, 10)} 00:00:00`;
        query.andWhere('ticket.created_at >= :startDate', { startDate: parsedStartDate });
      }
      if (status !== 'disbursed' && endDate && endDate !== 'all') {
        const parsedEndDate = `${endDate.substring(0, 10)} 23:59:59`;
        query.andWhere('ticket.created_at <= :endDate', { endDate: parsedEndDate });
      }
    }

    if (startDate === 'all') {
      // Bypass date filter completely for disbursed status too
    } else if (status === 'disbursed' && startDate && endDate && startDate !== 'all' && endDate !== 'all') {
      const parsedStartDate = `${startDate.substring(0, 10)} 00:00:00`;
      query.andWhere('ticket.disbursed_at >= :startDate', { startDate: parsedStartDate });
      const parsedEndDate = `${endDate.substring(0, 10)} 23:59:59`;
      query.andWhere('ticket.disbursed_at <= :endDate', { endDate: parsedEndDate });
    } else if (status === 'disbursed' && !startDate && !endDate && (!name || name.trim() === '')) {
      // Default to current month only if no search term and no specific dates are provided
      query.andWhere('ticket.disbursed_at >= DATE_FORMAT(NOW(), :startOfMonth)', {
        startOfMonth: '%Y-%m-01 00:00:00',
      });
      query.andWhere('ticket.disbursed_at <= DATE_FORMAT(LAST_DAY(NOW()), :endOfMonth)', {
        endOfMonth: '%Y-%m-%d 23:59:59',
      });
    }
    // console.log(query.getSql(), "queyyy>>", query.getParameters());
    const [tickets, count] = await query.getManyAndCount();
    // Calculate total disbursed amount if status is 'disbursed'
    let totalDisbursedAmount = 0;
    if (status === 'disbursed') {
      totalDisbursedAmount = tickets.reduce((sum, ticket) => {
        return sum + (parseFloat(String(ticket?.application?.amount || '0')));
      }, 0);
    }

    const results = tickets.map((ticket) => {
      const { application } = ticket;
      const { customer, loanTracking } = application;

      const customerProfileImages = (customer.customerDocuments ?? [])
        .filter((doc) => doc.type === 'profile photo')
        .map((doc) => doc.document_url);
      return {
        ticketId: ticket.id,
        ticketStatus: ticket.status,
        user_id: ticket.user_id,
        createdAt: ticket.created_at,
        disbursedAt: ticket.disbursed_at,
        disbursedAmount: ticket.disbursed_amount,
        approvedAt: ticket.approved_at,
        approvedAmount: ticket.approved_amount,
        approvedCashbackAmount: ticket.cashback_amount,
        applicationAmount: application.amount,
        loanCategory: application.loan_category,
        loanType: application.loan_type,
        leadType: application.lead_type,
        applicationTenure: application.tenure,
        applicationDate: application.application_date,
        applicationId: application.id,
        applicationSource: application.source,
        appliedBy: application.applied_by ?? null,
        customerId: customer?.id ?? 'No ID',
        customerName: customer?.name ?? 'No Name',
        customerEmail: customer?.email ?? 'No Email',
        customerContact: customer?.contact ?? 'No Contact',
        customerProfileImage: customerProfileImages.length > 0 ? customerProfileImages : 'No image available',
        customerLocation: customer.info?.city ?? 'No location available',
        customerState: customer.info?.state ?? 'No location available',
        loanStatus: loanTracking[0]?.status ?? 'No status available',
        applicationProvider: application.provider ?? 'No provider available',
        case_type: ticket.case_type ?? '',
        fixed_commission_percentage: ticket.fixed_commission_percentage ?? null,
        companyId: ticket.companyId,
      };
    });

    const response: PaginationResult = {
      results,
      count,
      pages: Math.ceil(count / limit),
    };

    if (status === 'disbursed') {
      response.totalDisbursedAmount = totalDisbursedAmount;
    }
    return response;
  }

  async findOne(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    return ticket;
  }

  async findTicketWithDetail(ticketId: number): Promise<TicketResponse> {
    const ticket = await this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.application', 'application')
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
      .where('ticket.id = :ticketId', { ticketId })
      .getOne();

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    const customerDocuments = ticket.application?.customer?.customerDocuments?.map(
      (doc) => ({
        id: doc.id,
        type: doc.type,
        document_url: doc.document_url,
      })
    ) ?? [];

    const appliedBy = ticket.application?.applied_by;
    const applicantAndManager = await this.teamsService.getApplicantAndManagerName(Number(appliedBy));

    return {
      ticketId: ticket.id,
      userId: ticket.user_id,
      employeeStatus: ticket.status,
      disbursed_at: ticket.disbursed_at,
      disbursed_amount: ticket.disbursed_amount,
      approved_at: ticket.approved_at,
      approved_amount: ticket.approved_amount,
      cashback_amount: ticket.cashback_amount,
      voiceNoteUrl: ticket.voice_note_url,
      forwardedTo: ticket.forwarded_to,
      isForwarded: ticket.is_forwarded,
      originalEstimate: ticket.original_estimate,
      provider: ticket.application?.provider ?? 'No Provider',
      applicationAmount: ticket.application?.amount ?? 'No Amount',
      applicationTenure: ticket.application?.tenure ?? 'No Tenure',
      applicationDate: ticket.application?.application_date ?? 'No Date',
      loanCategory: ticket.application?.loan_category ?? 'No Category',
      loanType: ticket.application?.loan_type ?? 'home loan',
      loanStatus: ticket.application?.loanTracking?.[0]?.status ?? '',
      applicationId: ticket.application?.id ?? '',
      applicationSource: ticket.application?.source ?? 'No Source',
      source: ticket.application?.source ?? 'No Source',
      customerId: ticket.application?.customer?.id ?? '',
      customerName: ticket.application?.customer?.name ?? 'No Name',
      customerEmail: ticket.application?.customer?.email ?? 'No Email',
      customerContact: ticket.application?.customer?.contact ?? 'No Contact',
      customerDocuments: customerDocuments,
      customerDesignation: ticket.application?.customer?.info?.employment_type ?? 'Not available',
      customerLocation: ticket.application?.customer?.info?.city ?? 'No Location available',
      customerState: ticket.application?.customer?.info?.state ?? 'No Location available',
      customerPAN: ticket.application?.customer?.info?.pan ?? 'No PAN',
      appliedBy: ticket.application?.applied_by ?? null,
      appliedByName: applicantAndManager.applicantName,
      managerName: applicantAndManager.managerName,
      case_type: ticket.case_type ?? '',
      fixed_commission_percentage: ticket.fixed_commission_percentage ?? null,
      companyId: ticket.companyId,
      due_date: ticket.due_date ?? null,
      co_applicant_name: ticket.application?.customer?.info?.co_applicant_name ?? '',
      co_applicant_contact: ticket.application?.customer?.info?.co_applicant_contact ?? '',
      co_applicant_email: ticket.application?.customer?.info?.co_applicant_email ?? '',
      co_applicant_mother_name: ticket.application?.customer?.info?.co_applicant_mother_name ?? '',
    };
  }

  /**
   * Update ticket fields. Commission webhook is NOT auto-triggered here.
   * Use triggerDisbursementCommission() after saving all disbursement details.
   */
  async update(id: number, updateTicketDto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(id);
    const oldStatus = ticket.status;
    console.log("updateTicketDto", updateTicketDto.status, '=>', ticket.status);

    Object.assign(ticket, updateTicketDto, { updatedAt: new Date() });
    const updatedTicket = await this.ticketRepository.save(ticket);

    // SEND NOTIFICATION IF STATUS CHANGED
    if (oldStatus !== updateTicketDto.status && updateTicketDto.status) {
      await this.sendTicketStatusNotification(updatedTicket, oldStatus, updateTicketDto.status, updateTicketDto.actorName);
    }

    if (
      updateTicketDto.status === 'disbursed' &&
      updatedTicket.disbursed_amount &&
      updatedTicket.disbursed_amount > 0
    ) {
      await this.triggerDisbursementCommission(updatedTicket.id);
    }

    return updatedTicket;
  }

  /**
   * Explicitly trigger commission processing for a disbursed ticket.
   * Called AFTER all disbursement details are saved (from "Save Details" button).
   */
  async triggerDisbursementCommission(ticketId: number): Promise<{ success: boolean; message: string }> {
    const ticket = await this.findOne(ticketId);

    if (ticket.status !== 'disbursed') {
      return { success: false, message: `Ticket ${ticketId} is not in disbursed status (current: ${ticket.status})` };
    }

    if (!ticket.disbursed_amount || ticket.disbursed_amount <= 0) {
      return { success: false, message: `Ticket ${ticketId} has no valid disbursed amount` };
    }

    console.log(`[COMMISSION TRIGGER] Explicit trigger for ticket ${ticketId} with case_type: ${ticket.case_type}, cashback: ${ticket.cashback_amount}, fixed_commission: ${ticket.fixed_commission_percentage}`);

    try {
      await this.triggerCommissionProcessing(ticket);
      return { success: true, message: `Commission processing triggered for ticket ${ticketId}` };
    } catch (error) {
      console.error(`[COMMISSION ERROR] Failed to trigger commission for ticket ${ticketId}:`, error.message);
      return { success: false, message: `Failed to trigger commission: ${error.message}` };
    }
  }

  /**
   * Trigger commission processing via GraphQL webhook
   * Uses retry mechanism with exponential backoff
   */
  private async triggerCommissionProcessing(ticket: Ticket): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    // Fetch full ticket details with application and customer info
    const ticketDetails = await this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.application', 'application')
      .leftJoinAndSelect('application.customer', 'customer')
      .where('ticket.id = :id', { id: ticket.id })
      .getOne();

    if (!ticketDetails || !ticketDetails.application) {
      console.error(`[COMMISSION ERROR] Ticket ${ticket.id} missing application data`);
      return;
    }

    const mutation = `
      mutation ProcessSingleTicketCommission($ticketId: Int!) {
        processSingleTicketCommission(ticketId: $ticketId) {
          success
          message
          commission {
            id
            ticketId
            status
          }
        }
      }
    `;

    const variables = {
      ticketId: ticket.id,
    };

    // Retry loop with exponential backoff
    while (attempt < this.MAX_RETRY_ATTEMPTS) {
      try {
        console.log(`[COMMISSION ATTEMPT ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS}] Processing ticket ${ticket.id}`);

        const response = await firstValueFrom(
          this.httpService.post(
            this.COMMISSION_WEBHOOK_URL,
            {
              query: mutation,
              variables,
            },
            {
              timeout: 30000, // 30 second timeout
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
        );

        if (response.data.errors) {
          throw new Error(`GraphQL Error: ${JSON.stringify(response.data.errors)}`);
        }

        const result = response.data.data?.processSingleTicketCommission;

        if (result?.success) {
          console.log(`[COMMISSION SUCCESS] Ticket ${ticket.id} processed successfully. Commission ID: ${result.commission?.id}`);
          return; // Success - exit retry loop
        } else if (
          typeof result?.message === 'string' &&
          result.message.toLowerCase().includes('already exists')
        ) {
          console.log(`[COMMISSION EXISTS] Ticket ${ticket.id}: ${result.message}`);
          return;
        } else {
          throw new Error(result?.message || 'Unknown error from commission service');
        }

      } catch (error) {
        lastError = error;
        attempt++;

        console.error(
          `[COMMISSION ERROR] Attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS} failed for ticket ${ticket.id}:`,
          error.message
        );

        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          // Exponential backoff: 2s, 4s, 8s...
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`[COMMISSION RETRY] Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed - log final error
    console.error(
      `[COMMISSION FAILED] All ${this.MAX_RETRY_ATTEMPTS} attempts failed for ticket ${ticket.id}. Last error:`,
      lastError?.message
    );

    // Note: The cron job at 7 PM will catch this as a backup
    console.log(`[COMMISSION BACKUP] Ticket ${ticket.id} will be processed by 7 PM cron job backup`);
  }

  /**
   * Helper method for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send ticket status change notification to main GraphQL server
   */
  private async sendTicketStatusNotification(
    ticket: Ticket,
    oldStatus: string,
    newStatus: string,
    actorName?: string,
  ): Promise<void> {
    try {
      const graphqlEndpoint = process.env.GRAPHQL_SERVER_URL || 'http://localhost:4000/graphql';

      // Find ticket details with application and user info
      const ticketDetails = await this.ticketRepository
        .createQueryBuilder('ticket')
        .leftJoinAndSelect('ticket.application', 'application')
        .leftJoinAndSelect('application.customer', 'customer')
        .where('ticket.id = :id', { id: ticket.id })
        .getOne();

      if (!ticketDetails) {
        console.warn(`Ticket ${ticket.id} not found for notification`);
        return;
      }

      // ✅ THE FIX: We extract the ID of the Sales Rep who actually created the application
      // instead of using ticket.user_id (which belonged to the Operations Admin making the edit)
      const salesUserId =
        ticketDetails.application?.applied_by ??
        (ticketDetails.application as any)?.appliedBy ??
        ticket.user_id;

      const mutation = `
        mutation CreateTicketNotification($input: CreateTicketNotificationInput!) {
          createTicketNotification(input: $input) {
            success
            message
          }
        }
      `;

      const variables = {
        input: {
          ticketId: ticket.id,
          userId: Number(salesUserId), // ✅ This safely sends the OMS Sales ID!
          companyId: ticket.companyId,
          oldStatus,
          newStatus,
          customerName: ticketDetails.application?.customer?.name || 'Customer',
          aggregatorMemberId: ticketDetails.application?.aggregator_member_id || null,
        },
      };

      await firstValueFrom(
        this.httpService.post(graphqlEndpoint, {
          query: mutation,
          variables,
        }),
      ).catch(e => console.error("Failed to send graphql notification:", e.message));

      // Save notification to shared MySQL database for REST admin
      const byUserText = actorName ? ` by ${actorName}` : '';
      const savedNotification = await this.notificationsService.createTicketNotification({
        company_id: ticket.companyId,
        user_id: Number(salesUserId),
        customer_id: ticketDetails.application?.customer?.id || null,
        ticket_id: ticket.id,
        old_status: oldStatus,
        new_status: newStatus,
        title: 'Ticket Status Updated',
        message: `Ticket #${ticket.id} for ${ticketDetails.application?.customer?.name || 'Customer'} has been updated to ${newStatus}${byUserText}`,
        type: 'ticket',
        status: 'pending',
      });

      // Trigger socket webhook on Express server
      const expressWebhookUrl = process.env.EXPRESS_SERVER_URL || 'http://localhost:8080/api/v1/emit-ticket-notification';
      await firstValueFrom(
        this.httpService.post(expressWebhookUrl, {
          notificationId: savedNotification.id,
          ticketId: ticket.id
        })
      ).catch(e => console.error("Failed to trigger express socket webhook:", e.message));

      console.log(
        `Notification sent for ticket #${ticket.id} status change. Assigned to userId: ${salesUserId}, aggregatorMemberId: ${ticketDetails.application?.aggregator_member_id || 'none'}`,
      );
    } catch (error) {
      console.error(`Failed to send ticket notification: ${error.message}`);
    }
  }

  async remove(ticketId: number, reason: string, archivedByUserId: number): Promise<void> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['application', 'application.customer']
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // Remove only the related entities but NOT the application/customer
    // const ticketHistory = await this.ticketHistoryRepository.find( { where: { ticket_id: ticketId } } );
    // const ticketLog = await this.ticketLogRepository.find( { where: { ticket_id: ticketId } } );
    // const ticketActivity = await this.ticketActivityRepository.find( { where: { ticket_id: ticketId } } );
    // const loanTracking = await this.loanTrackingRepository.find( { where: { customer_application_id: ticket.customer_application_id } } );

    // if ( ticketHistory.length )
    // {
    //   await this.ticketHistoryRepository.remove( ticketHistory );
    // }
    // if ( ticketLog.length )
    // {
    //   await this.ticketLogRepository.remove( ticketLog );
    // }
    // if ( ticketActivity.length )
    // {
    //   await this.ticketActivityRepository.remove( ticketActivity );
    // }
    // if ( loanTracking.length )
    // {
    //   await this.loanTrackingRepository.remove( loanTracking );
    // }

    // Move ticket to ticket_archive WITHOUT modifying its structure
    const archivedTicket = this.ticketArchiveRepository.create({
      ...ticket,
      original_ticket_id: ticket.id,
      archived_at: new Date(),
      reason_to_delete: reason,
      archived_by: archivedByUserId,
    });

    await this.ticketArchiveRepository.save(archivedTicket);

    // Remove only the ticket, NOT the application
    await this.ticketRepository.remove(ticket);

    // DON'T remove the customer application
    // await this.customerApplicationRepository.remove( customerApplication );
  }

  // Restore Original ticket from archive
  async restoreOriginalTicket(archiveId: number): Promise<void> {
    const archivedTicket = await this.ticketArchiveRepository.findOneBy({ id: archiveId });
    if (!archivedTicket) {
      throw new Error('Archived ticket not found');
    }

    // Create a new ticket from the archived data
    const restoredTicket = this.ticketRepository.create({
      ...archivedTicket,
      updated_at: new Date(),
      due_date: archivedTicket.due_date,
    });
    await this.ticketRepository.save(restoredTicket);
    await this.ticketArchiveRepository.delete(archiveId);
  }

  async findAllArchivedTickets(
    page: number,
    limit: number,
    status?: string,
    provider?: string,
    name?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
    companyId?: number,
  ): Promise<PaginationResult> {
    page = Number(page) || 1;
    limit = Number(limit) || 10;
    const skip = (page - 1) * limit;

    const query = this.ticketArchiveRepository.createQueryBuilder('archive')
      .leftJoinAndSelect('archive.application', 'application')
      .leftJoinAndSelect('application.customer', 'customer')
      .leftJoinAndSelect('customer.info', 'info')
      .leftJoinAndSelect('customer.customerDocuments', 'documents')
      .leftJoinAndSelect('application.loanTracking', 'loanTracking')
      .skip(skip)
      .take(limit)
      .orderBy('archive.archived_at', 'DESC')
      .where('1 = 1');

    if (companyId) {
      query.andWhere('archive.companyId = :companyId', { companyId });
    }

    if (status && status !== 'all' && status.trim() !== '') {
      query.andWhere('archive.status = :status', { status });
    }

    if (provider && provider !== 'all' && provider.trim() !== '') {
      query.andWhere('LOWER(application.provider) LIKE LOWER(:provider)', { provider: `%${provider}%` });
    }

    if (name && name.trim() !== '') {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(customer.name) LIKE :name', { name: `%${name.toLowerCase()}%` })
            .orWhere('LOWER(customer.contact) LIKE :name', { name: `%${name.toLowerCase()}%` });
        }),
      );
    }

    if (search && search.trim() !== '') {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('archive.id = :searchId', { searchId: Number(search) || 0 })
            .orWhere('archive.original_ticket_id = :searchOriginalId', { searchOriginalId: Number(search) || 0 })
            .orWhere('archive.archived_by = :searchUserId', { searchUserId: Number(search) || 0 })
            .orWhere('customer.contact LIKE :searchContact', { searchContact: `%${search}%` })
            .orWhere('customer.email LIKE :searchEmail', { searchEmail: `%${search}%` })
            .orWhere('CAST(archive.id AS CHAR) LIKE :searchIdStr', { searchIdStr: `%${search}%` })
            .orWhere('CAST(archive.archived_by AS CHAR) LIKE :searchUserIdStr', { searchUserIdStr: `%${search}%` });
        }),
      );
    }

    if (!startDate && !endDate) {
      // Show tickets from the last 6 months by default
      query.andWhere('archive.archived_at >= DATE_SUB(NOW(), INTERVAL 11 MONTH)');
    } else {
      // Apply provided date filters
      if (startDate) {
        query.andWhere('archive.archived_at >= :startDate', { startDate });
      }
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        const formattedEndDate = endDateObj.toISOString().replace("T", " ").substring(0, 19);
        query.andWhere('archive.archived_at <= :endDate', { endDate: formattedEndDate });
      }
    }

    const [archivedTickets, count] = await query.getManyAndCount();

    const results = archivedTickets.map((archive) => {
      const { application } = archive;
      const { customer, loanTracking } = application || {};

      const customerProfileImages = customer?.customerDocuments
        ?.filter((doc) => doc.type === 'profile photo')
        .map((doc) => doc.document_url) || [];

      return {
        archiveId: archive.id,
        archiveBy: archive.archived_by,
        originalTicketId: archive.original_ticket_id,
        ticketStatus: archive.status,
        user_id: archive.user_id,
        createdAt: archive.created_at,
        archivedAt: archive.archived_at,
        applicationAmount: application?.amount || 'No Amount',
        applicationTenure: application?.tenure || 'No Tenure',
        applicationDate: application?.application_date || 'No Date',
        applicationId: application?.id || '',
        applicationSource: application?.source || 'No Source',
        customerId: customer?.id ?? 'No ID',
        customerName: customer?.name ?? 'No Name',
        customerEmail: customer?.email ?? 'No Email',
        customerContact: customer?.contact ?? 'No Contact',
        customerProfileImage: customerProfileImages.length > 0 ? customerProfileImages : 'No image available',
        customerLocation: customer?.info?.city ?? 'No location available',
        customerState: customer?.info?.state ?? 'No location available',
        loanStatus: loanTracking?.[0]?.status ?? 'No status available',
        applicationProvider: application?.provider ?? 'No provider available',
        reason: archive?.reason_to_delete,
        companyId: archive.companyId,
        cashback_amount: archive.cashback_amount ?? null,
        fixed_commission_percentage: archive.fixed_commission_percentage ?? null,
        case_type: archive.case_type ?? '',
      };
    });

    return {
      results,
      count,
      pages: Math.ceil(count / limit),
    };
  }

  async findArchivedTicketWithDetail(archiveId: number): Promise<any> {
    const archivedTicket = await this.ticketArchiveRepository
      .createQueryBuilder('archive')
      .leftJoinAndSelect('archive.application', 'application')
      .leftJoinAndSelect('application.customer', 'customer')
      .leftJoinAndSelect('customer.info', 'info')
      .leftJoinAndSelect('customer.customerDocuments', 'documents')
      .leftJoinAndSelect('application.loanTracking', 'loanTracking')
      .where('archive.id = :archiveId', { archiveId })
      .getOne();

    if (!archivedTicket) {
      throw new NotFoundException(`Archived ticket with ID ${archiveId} not found`);
    }

    const customerDocuments = archivedTicket.application?.customer?.customerDocuments?.map(
      (doc) => ({
        id: doc.id,
        type: doc.type,
        document_url: doc.document_url,
      })
    ) ?? [];

    return {
      archiveId: archivedTicket.id,
      originalTicketId: archivedTicket.original_ticket_id,
      userId: archivedTicket.user_id,
      employeeStatus: archivedTicket.status,
      voiceNoteUrl: archivedTicket.voice_note_url,
      forwardedTo: archivedTicket.forwarded_to,
      isForwarded: archivedTicket.is_forwarded,
      originalEstimate: archivedTicket.original_estimate,
      createdAt: archivedTicket.created_at,
      archivedAt: archivedTicket.archived_at,
      provider: archivedTicket.application?.provider ?? 'No Provider',
      applicationAmount: archivedTicket.application?.amount ?? 'No Amount',
      applicationTenure: archivedTicket.application?.tenure ?? 'No Tenure',
      applicationDate: archivedTicket.application?.application_date ?? 'No Date',
      applicationId: archivedTicket.application?.id ?? '',
      customerId: archivedTicket.application?.customer?.id ?? '',
      customerName: archivedTicket.application?.customer?.name ?? 'No Name',
      customerEmail: archivedTicket.application?.customer?.email ?? 'No Email',
      customerContact: archivedTicket.application?.customer?.contact ?? 'No Contact',
      customerDocuments: customerDocuments,
      customerDesignation: archivedTicket.application?.customer?.info?.employment_type ?? 'Not available',
      customerLocation: archivedTicket.application?.customer?.info?.city ?? 'No Location available',
      customerState: archivedTicket.application?.customer?.info?.state ?? 'No Location available',
      loanStatus: archivedTicket.application?.loanTracking?.[0]?.status ?? '',
      reason: archivedTicket?.reason_to_delete,
      cashback_amount: archivedTicket.cashback_amount ?? null,
      fixed_commission_percentage: archivedTicket.fixed_commission_percentage ?? null,
      case_type: archivedTicket.case_type ?? '',
    };
  }
}
