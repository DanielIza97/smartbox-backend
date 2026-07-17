import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassOrResource } from './entities/class-or-resource.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { CreateClassDto } from './dto/create-class.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { Gym } from '../gyms/entities/gym.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { computeOccurrences } from './occurrence.util';

const DEFAULT_AVAILABILITY_WINDOW_DAYS = 14;

export interface AvailabilitySlot {
  startAt: Date;
  endAt: Date;
  capacity: number;
  available: number;
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(ClassOrResource)
    private readonly classRepository: Repository<ClassOrResource>,
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
  ) {}

  async create(dto: CreateClassDto): Promise<ClassOrResource> {
    const gymId = dto.gymId;
    if (!gymId) {
      throw new BadRequestException('gymId es obligatorio.');
    }

    const gym = await this.gymRepository.findOne({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException('El gimnasio especificado no existe.');
    }

    const classOrResource = this.classRepository.create({
      name: dto.name,
      capacity: dto.capacity,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      durationMinutes: dto.durationMinutes,
      gymId,
    });
    return await this.classRepository.save(classOrResource);
  }

  async findAll(requester: AuthenticatedUser): Promise<ClassOrResource[]> {
    if (requester.role === 'SUPER_ADMIN') {
      return await this.classRepository.find();
    }
    return await this.classRepository.find({
      where: { gymId: requester.gymId ?? '' },
    });
  }

  async findOne(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<ClassOrResource> {
    const classOrResource = await this.classRepository.findOne({
      where: { id },
    });
    if (!classOrResource) {
      throw new NotFoundException(`Clase con ID ${id} no encontrada.`);
    }
    if (
      requester.role !== 'SUPER_ADMIN' &&
      classOrResource.gymId !== requester.gymId
    ) {
      throw new ForbiddenException('No tenés acceso a esta clase.');
    }
    return classOrResource;
  }

  async getAvailability(
    id: string,
    requester: AuthenticatedUser,
    query: AvailabilityQueryDto,
  ): Promise<AvailabilitySlot[]> {
    const classOrResource = await this.findOne(id, requester);

    const rangeStart = query.from ? new Date(query.from) : new Date();
    const rangeEnd = query.to
      ? new Date(query.to)
      : new Date(
          rangeStart.getTime() +
            DEFAULT_AVAILABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );

    const occurrences = computeOccurrences(
      classOrResource,
      rangeStart,
      rangeEnd,
    );

    const slots: AvailabilitySlot[] = [];
    for (const occurrence of occurrences) {
      const bookedCount = await this.reservationRepository.count({
        where: {
          classId: classOrResource.id,
          startAt: occurrence.startAt,
          status: 'confirmed',
        },
      });
      slots.push({
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        capacity: classOrResource.capacity,
        available: Math.max(classOrResource.capacity - bookedCount, 0),
      });
    }
    return slots;
  }
}
