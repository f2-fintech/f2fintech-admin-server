import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async createTicketNotification(data: Partial<Notification>): Promise<Notification> {
    const notification = this.notificationRepository.create(data);
    return await this.notificationRepository.save(notification);
  }

  async getAdminNotifications(companyId: number, limit: number = 20, page: number = 1) {
    const skip = (page - 1) * limit;
    const whereClause: any = { type: 'ticket' };
    if (companyId && Number(companyId) !== 101) {
      whereClause.company_id = companyId;
    }

    const [notifications, total] = await this.notificationRepository.findAndCount({
      where: whereClause,
      order: {
        created_at: 'DESC',
      },
      take: limit,
      skip: skip,
    });

    return {
      notifications,
      total,
      page,
      limit,
    };
  }

  async getNotificationById(id: number) {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }
    return notification;
  }
}
