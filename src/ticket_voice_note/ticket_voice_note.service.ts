import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateTicketVoiceNoteDto } from './dto/create_ticket_voice_note.dto';
import { TicketVoiceNote } from './entities/ticket_voice_note.entity';

@Injectable()
export class TicketVoiceNoteService {
  constructor(
    @InjectRepository(TicketVoiceNote)
    private readonly ticketVoiceNoteRepository: Repository<TicketVoiceNote>,
  ) { }

  // Create a new voice note
  async create(
    createTicketVoiceNoteDto: CreateTicketVoiceNoteDto,
    companyId?: string, // Accept companyId as parameter
  ): Promise<TicketVoiceNote> {
    const newVoiceNote = this.ticketVoiceNoteRepository.create({
      ...createTicketVoiceNoteDto,
      company_id: companyId ? parseInt(companyId, 10) : null, // Parse and add company_id
      created_at: new Date(),
    });

    return await this.ticketVoiceNoteRepository.save(newVoiceNote);
  }

  // Retrieve all voice notes by ticket ID
  async findAllByTicketId(ticketId: number, companyId?: string) {
    const parsedCompanyId = companyId ? parseInt(companyId, 10) : null;

    const query = this.ticketVoiceNoteRepository
      .createQueryBuilder('voiceNote')
      .where('voiceNote.ticket_id = :ticketId', { ticketId });

    if (parsedCompanyId && parsedCompanyId !== 101) {
      query.andWhere('voiceNote.company_id = :companyId', { companyId: parsedCompanyId });
    }

    return await query
      .orderBy('voiceNote.created_at', 'DESC')
      .getMany();
  }

  // Retrieve a single voice note by ticket_id
  async findOne(
    ticket_id: number,
    companyId?: string,
  ): Promise<TicketVoiceNote> {
    const parsedCompanyId = companyId ? parseInt(companyId, 10) : null;

    const whereCondition: any = { ticket_id };
    if (parsedCompanyId && parsedCompanyId !== 101) {
      whereCondition.company_id = parsedCompanyId;
    }

    const voiceNote = await this.ticketVoiceNoteRepository.findOne({
      where: whereCondition,
    });

    if (!voiceNote) {
      throw new NotFoundException(
        `Voice Note with ticket ID ${ticket_id} not found for this company`,
      );
    }
    return voiceNote;
  }

  // Delete an existing voice note by id
  async remove(id: number, companyId?: string): Promise<void> {
    const parsedCompanyId = companyId ? parseInt(companyId, 10) : null;

    const voiceNote = await this.ticketVoiceNoteRepository.findOne({
      where: { id },
    });

    if (!voiceNote) {
      throw new NotFoundException(`Voice Note with id ${id} not found`);
    }

    // Check if companyId matches (if provided, except company 101)
    if (parsedCompanyId && parsedCompanyId !== 101 && voiceNote.company_id !== parsedCompanyId) {
      throw new ForbiddenException(
        'You do not have permission to delete this voice note',
      );
    }

    await this.ticketVoiceNoteRepository.remove(voiceNote);
  }
}