import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateTicketActivityDto } from './dto/create_ticket_activity.dto';
import { UpdateTicketActivityDto } from './dto/update_ticket_activity.dto';
import { TicketActivity } from './entities/ticket_activities.entity';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(TicketActivity)
    private readonly activityRepository: Repository<TicketActivity>,
  ) { }

  // Create a new activity with companyId
  async create(
    createTicketActivityDto: CreateTicketActivityDto,
    companyId?: number
  ): Promise<TicketActivity> {
    console.log('Creating ticket activity with companyId:', companyId);
    console.log('Activity data:', createTicketActivityDto);

    const newActivity = this.activityRepository.create({
      ...createTicketActivityDto,
      company_id: companyId, // Add company_id to the entity
      created_at: new Date()
    });

    const savedActivity = await this.activityRepository.save(newActivity);
    console.log('Saved activity:', savedActivity);
    return savedActivity;
  }

  // Retrieve all activities by ticket ID with company filter
  async findAllByTicketId(
    ticketId: number,
    companyId?: number
  ) {
    console.log('Finding activities for ticket:', ticketId, 'companyId:', companyId);

    // Build where conditions
    const whereConditions: any = { ticket_id: ticketId };

    // If companyId is provided, filter by it (except company 101 which can access all)
    // If companyId is null (super admin), return all
    if (companyId !== undefined && companyId !== null && Number(companyId) !== 101) {
      whereConditions.company_id = companyId;
    }

    const activities = await this.activityRepository.find({
      where: whereConditions,
      relations: ['user'],
      order: { created_at: 'DESC' }
    });

    console.log('Found activities:', activities.length);
    return activities;
  }

  // Retrieve a single activity by ticket_id with company check
  async findOne(
    ticket_id: number,
    companyId?: number
  ): Promise<TicketActivity> {
    const whereConditions: any = { ticket_id };

    if (companyId !== undefined && companyId !== null && Number(companyId) !== 101) {
      whereConditions.company_id = companyId;
    }

    const activity = await this.activityRepository.findOne({
      where: whereConditions
    });

    if (!activity) {
      throw new NotFoundException(
        `Activity with ticket ID ${ticket_id} not found` +
        (companyId !== undefined && companyId !== null ? ` for company ${companyId}` : '')
      );
    }
    return activity;
  }

  // Service method to update a ticket activity by ticket_id and id with company check
  async updateByTicketIdAndId(
    ticket_id: number,
    id: number,
    updateTicketActivityDto: UpdateTicketActivityDto,
    companyId?: number
  ): Promise<TicketActivity> {
    console.log('Updating activity:', { ticket_id, id, companyId });

    if (isNaN(id)) {
      throw new BadRequestException(`Invalid ID format`);
    }

    // Build where conditions
    const whereConditions: any = { ticket_id, id };

    // If companyId is provided, also filter by company_id (except for company 101)
    if (companyId !== undefined && companyId !== null && Number(companyId) !== 101) {
      whereConditions.company_id = companyId;
    }

    // Find the activity using both ticket_id and id
    const activity = await this.activityRepository.findOne({
      where: whereConditions
    });

    if (!activity) {
      throw new NotFoundException(
        `Activity with ticket ID ${ticket_id} and ID ${id} not found` +
        (companyId !== undefined && companyId !== null ? ` for company ${companyId}` : '')
      );
    }

    console.log('Found activity to update:', activity);

    // Update the activity fields
    Object.assign(activity, updateTicketActivityDto, { updated_at: new Date() });

    // Save and return the updated activity
    const updatedActivity = await this.activityRepository.save(activity);
    console.log('Updated activity:', updatedActivity);
    return updatedActivity;
  }

  // Delete an existing activity by id with company check
  async remove(
    id: number,
    companyId?: number
  ): Promise<void> {
    console.log('Deleting activity:', { id, companyId });

    // Build where conditions
    const whereConditions: any = { id };

    // If companyId is provided, also filter by company_id (except for company 101)
    if (companyId !== undefined && companyId !== null && Number(companyId) !== 101) {
      whereConditions.company_id = companyId;
    }

    const activity = await this.activityRepository.findOne({
      where: whereConditions
    });

    if (!activity) {
      throw new NotFoundException(
        `Activity with id ${id} not found` +
        (companyId !== undefined && companyId !== null ? ` for company ${companyId}` : '')
      );
    }

    console.log('Found activity to delete:', activity);
    await this.activityRepository.remove(activity);
    console.log('Activity deleted successfully');
  }
}