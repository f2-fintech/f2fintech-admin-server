import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateTicketHistoryDto } from './dto/create-ticket_history.dto';
import { TicketHistory } from './entities/ticket_history.entity';

@Injectable()
export class TicketHistoryService {
  constructor(
    @InjectRepository(TicketHistory)
    private readonly ticketHistoryRepository: Repository<TicketHistory>,
  ) { }

  async create(
    createTicketHistoryDto: CreateTicketHistoryDto,
    companyId?: number
  ): Promise<TicketHistory> {
    const ticketHistoryData = {
      ...createTicketHistoryDto,
      ...(companyId !== undefined && companyId !== null && { company_id: companyId }),
      created_at: new Date()
    };

    const newTicketHistory = this.ticketHistoryRepository.create(ticketHistoryData);
    return await this.ticketHistoryRepository.save(newTicketHistory);
  }

  async findAllByTicketId(ticketId: number, companyId?: number) {
    const query = this.ticketHistoryRepository.createQueryBuilder('ticket_history')
      .where('ticket_history.ticket_id = :ticketId', { ticketId })
      .orderBy('ticket_history.created_at', 'DESC');

    // Apply company filter if companyId is provided (except for company 101)
    if (companyId && Number(companyId) !== 101) {
      query.andWhere('ticket_history.company_id = :companyId', { companyId });
    }

    const histories = await query.getMany();

    // If no histories found, you might want to handle this case
    if (histories.length === 0) {
      throw new NotFoundException(`No history found for ticket ID ${ticketId}`);
    }

    return histories;
  }
}