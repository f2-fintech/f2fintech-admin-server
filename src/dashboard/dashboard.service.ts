import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, Repository } from 'typeorm';

import { Status, Ticket } from 'src/tickets/entities/ticket.entity';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(EntityManager) private readonly manager: EntityManager, // Inject the EntityManager
  ) { }

  private readonly logger = new Logger(DashboardService.name);

  async findAgentCount(): Promise<number> {

    return this.userRepository.count();
  }

  async findTicketsCount(id: number | number[] | null = null, status = null, date = null, month = null, year = null, companyId = null): Promise<number | { count: number, amount: number }> {
    const where: any = {};
    const qb = this.ticketRepository.createQueryBuilder('ticket');

    // Add companyId filter if provided (except company 101 which sees all)
    if (companyId && Number(companyId) !== 101) {
      qb.andWhere('ticket.company_id = :companyId', { companyId });
    }

    if (id) {
      const idToFetch = Array.isArray(id) ? id[0] : id;
      const user_info = await this.userRepository.findOne({ where: { id: idToFetch } });

      if (user_info.role && user_info.role !== 'admin' && user_info.role !== 'sub admin') {
        if (user_info.role === 'sales') {
          // For sales users, join with application and filter by applied_by
          qb.leftJoinAndSelect('ticket.application', 'application');
          if (Array.isArray(id)) {
            qb.where('application.applied_by IN (:...userIds)', { userIds: id });
          } else {
            qb.where('application.applied_by = :userId', { userId: id });
          }
        }
        else {
          qb.leftJoinAndSelect('users', 'user', 'user.id = ticket.user_id')
            .where('user.role = :role', { role: user_info.role });

          // Add company filter for other roles if companyId is provided (except company 101)
          if (companyId && Number(companyId) !== 101) {
            qb.andWhere('ticket.company_id = :companyId', { companyId });
          }
        }
      }
    }

    // ✅ Year filter (if provided and month is empty)
    if (year && !month) {
      const startOfYear = `${year}-01-01 00:00:00`;
      const endOfYear = `${year}-12-31 23:59:59`;

      if (status === 'disbursed') {
        qb.andWhere('ticket.disbursed_at BETWEEN :start AND :end', {
          start: startOfYear,
          end: endOfYear,
        });
      }
      else {
        qb.andWhere('ticket.created_at BETWEEN :start AND :end', {
          start: startOfYear,
          end: endOfYear,
        });
      }
    }

    if (month) {
      // Use the same reliable month calculation as getTotalTicketsByMonth
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      const monthIndex = monthNames.indexOf(month);
      if (monthIndex === -1) {
        throw new Error('Invalid month name');
      }

      const currentYear = year ? Number(year) : new Date().getFullYear();
      const monthStr = String(monthIndex + 1).padStart(2, '0');
      const startOfMonth = `${currentYear}-${monthStr}-01 00:00:00`;
      const lastDay = new Date(currentYear, monthIndex + 1, 0).getDate();
      const endOfMonth = `${currentYear}-${monthStr}-${String(lastDay).padStart(2, '0')} 23:59:59`;

      if (status === 'disbursed') {
        qb.andWhere('ticket.disbursed_at BETWEEN :start AND :end', {
          start: startOfMonth,
          end: endOfMonth,
        });
      }
      else {
        qb.andWhere('ticket.created_at BETWEEN :start AND :end', {
          start: startOfMonth,
          end: endOfMonth,
        });
      }
    }

    if (date) {
      const startOfDay = `${date} 00:00:00`;
      const endOfDay = `${date} 23:59:59`;

      if (status === 'disbursed') {
        qb.andWhere('ticket.disbursed_at BETWEEN :start AND :end', {
          start: startOfDay,
          end: endOfDay,
        });
        const [sql, params] = qb.getQueryAndParameters();
        console.log("Final SQL:", sql, params);
      }
      else {
        qb.andWhere('ticket.created_at BETWEEN :start AND :end', {
          start: startOfDay,
          end: endOfDay,
        });
      }
    }

    if (status) {
      if (status === 'forwarded' && id) {
        // Use query builder for OR condition
        const fqb = this.ticketRepository
          .createQueryBuilder('ticket')
          .where('ticket.status = :status', { status })
          .andWhere('ticket.forwarded_to IS NOT NULL')
          .andWhere(companyId && Number(companyId) !== 101 ? 'ticket.company_id = :companyId' : '1=1', companyId && Number(companyId) !== 101 ? { companyId } : {});

        if (Array.isArray(id)) {
          fqb.andWhere('ticket.user_id IN (:...ids)', { ids: id });
        } else {
          fqb.andWhere('ticket.user_id = :id', { id });
        }

        return fqb.getCount();
      } else {
        qb.andWhere('ticket.status = :status', { status: status });
      }
    }

    // Handling "disbursed" status to calculate total amount
    if (status === 'disbursed' || status === 'approved') {
      // Make sure application is joined for amount calculation
      if (!qb.expressionMap.joinAttributes.find(join => join.alias.name === 'application')) {
        qb.leftJoinAndSelect('ticket.application', 'application');
      }

      const tickets = await qb.getMany();

      // The sum of amounts from related applications
      const totalAmount = tickets.reduce((sum, ticket) => {
        let amount = 0;

        if (status === 'disbursed') {
          // For disbursed tickets, use disbursed_amount
          amount = parseFloat(String(ticket?.disbursed_amount || '0'));
        } else if (status === 'approved') {
          // For approved tickets, use application amount
          amount = parseFloat(String(ticket?.approved_amount || '0'));
        }

        return sum + amount;
      }, 0);

      return { count: tickets.length, amount: totalAmount };
    }

    // const [ sql, parameters ] = qb.getQueryAndParameters();
    // console.log( "SQL:", sql );
    // console.log( "Parameters:", parameters );

    // Return count based on the conditions
    return qb.getCount();
  }

  async getAggregateTicketCounts(
    id: number | number[] | null = null,
    date: string | null = null,
    month: string | null = null,
    year: string | null = null,
    companyId: number | null = null
  ): Promise<{ [status: string]: number }> {
    const qb = this.ticketRepository.createQueryBuilder('ticket');
    qb.select('ticket.status', 'status');
    qb.addSelect('COUNT(ticket.id)', 'count');

    // Add companyId filter if provided (except company 101)
    if (companyId && Number(companyId) !== 101) {
      qb.andWhere('ticket.company_id = :companyId', { companyId });
    }

    if (id) {
      const idToFetch = Array.isArray(id) ? id[0] : id;
      const user_info = await this.userRepository.findOne({ where: { id: idToFetch } });

      if (user_info.role && user_info.role !== 'admin' && user_info.role !== 'sub admin') {
        if (user_info.role === 'sales') {
          qb.leftJoin('ticket.application', 'application');
          if (Array.isArray(id)) {
            qb.andWhere('application.applied_by IN (:...userIds)', { userIds: id });
          } else {
            qb.andWhere('application.applied_by = :userId', { userId: id });
          }
        } else {
          qb.leftJoin('users', 'user', 'user.id = ticket.user_id')
            .andWhere('user.role = :role', { role: user_info.role });
        }
      }
    }

    // Date filters
    if (year && !month) {
      const startOfYear = `${year}-01-01 00:00:00`;
      const endOfYear = `${year}-12-31 23:59:59`;
      qb.andWhere(`(
        (ticket.status != 'disbursed' AND ticket.created_at BETWEEN :start AND :end)
        OR
        (ticket.status = 'disbursed' AND ticket.disbursed_at BETWEEN :start AND :end)
      )`, { start: startOfYear, end: endOfYear });
    }

    if (month) {
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      const monthIndex = monthNames.indexOf(month);
      if (monthIndex === -1) throw new Error('Invalid month name');

      const currentYear = year ? Number(year) : new Date().getFullYear();
      const monthStr = String(monthIndex + 1).padStart(2, '0');
      const startOfMonth = `${currentYear}-${monthStr}-01 00:00:00`;
      const lastDay = new Date(currentYear, monthIndex + 1, 0).getDate();
      const endOfMonth = `${currentYear}-${monthStr}-${String(lastDay).padStart(2, '0')} 23:59:59`;

      qb.andWhere(`(
        (ticket.status != 'disbursed' AND ticket.created_at BETWEEN :start AND :end)
        OR
        (ticket.status = 'disbursed' AND ticket.disbursed_at BETWEEN :start AND :end)
      )`, { start: startOfMonth, end: endOfMonth });
    }

    if (date) {
      const startOfDay = `${date} 00:00:00`;
      const endOfDay = `${date} 23:59:59`;
      qb.andWhere(`(
        (ticket.status != 'disbursed' AND ticket.created_at BETWEEN :start AND :end)
        OR
        (ticket.status = 'disbursed' AND ticket.disbursed_at BETWEEN :start AND :end)
      )`, { start: startOfDay, end: endOfDay });
    }

    qb.groupBy('ticket.status');
    const rawResults = await qb.getRawMany();

    const counts: { [status: string]: number } = {};
    let total = 0;
    rawResults.forEach(row => {
      const cnt = Number(row.count);
      counts[row.status] = cnt;
      total += cnt;
    });

    counts['total'] = total;

    return counts;
  }
  // Helper function to generate start and end of month dates
  private getMonthDateRange(year: number, month: number) {
    const startOfMonth = new Date(year, month, 1, 0, 0, 0);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

    // this.logger.debug(`Date range for month ${month + 1}: ${startOfMonth} to ${endOfMonth}`);
    return { startOfMonth, endOfMonth };
  }

  async getTotalTicketsByMonth(
    year: number,
    companyId: number = null
  ): Promise<{ month: string; count: number }[]> {
    const results = [];

    for (let month = 0; month < 12; month++) {
      const { startOfMonth, endOfMonth } = this.getMonthDateRange(year, month);

      const where: any = {
        created_at: Between(startOfMonth, endOfMonth),
      };

      // Add company filter if companyId is provided (except company 101)
      if (companyId && Number(companyId) !== 101) {
        where.companyId = companyId;
      }

      const count = await this.ticketRepository.count({ where });
      results.push({
        month: startOfMonth.toLocaleString('default', { month: 'long' }),
        count,
      });
    }
    return results;
  }

  async getDoneTicketsByMonth(
    year: number,
    companyId: number = null
  ): Promise<{ month: string; count: number }[]> {
    const results = [];

    for (let month = 0; month < 12; month++) {
      const { startOfMonth, endOfMonth } = this.getMonthDateRange(year, month);

      const where: any = {
        status: Status.DISBURSED,
        disbursed_at: Between(startOfMonth, endOfMonth),
      };

      // Add company filter if companyId is provided (except company 101)
      if (companyId && Number(companyId) !== 101) {
        where.companyId = companyId;
      }

      const count = await this.ticketRepository.count({ where });
      results.push({
        month: startOfMonth.toLocaleString('default', { month: 'long' }),
        count,
      });
    }
    return results;
  }
}
