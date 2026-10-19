import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateTicketLogDto } from './dto/create-ticket_log.dto';
import { TicketLog } from './entities/ticket_log.entity';

@Injectable()
export class TicketLogService {
  constructor(
    @InjectRepository(TicketLog)
    private readonly ticketLogRepository: Repository<TicketLog>,
  ) { }

  async create(
    createTicketLogDto: CreateTicketLogDto,
    companyId?: string,
  ): Promise<TicketLog> {
    const newTicketLog = this.ticketLogRepository.create({
      ...createTicketLogDto,
      company_id: companyId ? parseInt(companyId, 10) : null,
      created_at: new Date(),
    });
    return await this.ticketLogRepository.save(newTicketLog);
  }

  async findAllByTicketId(
    ticketId: number,
    companyId?: string,
  ) {
    const parsedCompanyId = companyId ? parseInt(companyId, 10) : null;

    const query = this.ticketLogRepository
      .createQueryBuilder('ticketLog')
      .where('ticketLog.ticket_id = :ticketId', { ticketId });

    if (parsedCompanyId && parsedCompanyId !== 101) {
      query.andWhere('ticketLog.company_id = :companyId', {
        companyId: parsedCompanyId
      });
    }

    return await query
      .orderBy('ticketLog.created_at', 'DESC')
      .getMany();
  }
}
