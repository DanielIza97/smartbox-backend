import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { isValidOccurrence } from '../classes/occurrence.util';
import { WaitlistService } from '../waitlist/waitlist.service';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(ClassOrResource)
    private readonly classRepository: Repository<ClassOrResource>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    private readonly waitlistService: WaitlistService,
  ) {}

  // Crear reserva (E3-03) — valida, en orden: la clase pertenece al gym del
  // socio, tiene membresía 'active' (HU-03: past_due/cancelled se rechazan
  // con mensaje explícito, no un error genérico), el horario pedido
  // corresponde a un turno real del patrón recurrente, hay cupo, y el
  // socio no tiene otra reserva confirmed que se superponga en el tiempo.
  async create(
    dto: CreateReservationDto,
    requester: AuthenticatedUser,
  ): Promise<Reservation> {
    if (!requester.gymId) {
      throw new BadRequestException(
        'Tu cuenta no pertenece a ningún gimnasio.',
      );
    }

    const classOrResource = await this.classRepository.findOne({
      where: { id: dto.classId },
    });
    if (!classOrResource) {
      throw new NotFoundException('Clase o recurso no encontrado.');
    }
    if (classOrResource.gymId !== requester.gymId) {
      throw new ForbiddenException('No tenés acceso a esta clase.');
    }

    const membership = await this.membershipRepository.findOne({
      where: { userId: requester.id, status: 'active' },
    });
    if (!membership) {
      throw new BadRequestException(
        'Necesitás una membresía activa para reservar.',
      );
    }

    const startAt = new Date(dto.startAt);
    if (startAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'No podés reservar un horario que ya pasó.',
      );
    }
    if (!isValidOccurrence(classOrResource, startAt)) {
      throw new BadRequestException(
        'Ese horario no corresponde a un turno válido de esta clase.',
      );
    }
    const endAt = new Date(
      startAt.getTime() + classOrResource.durationMinutes * 60_000,
    );

    const bookedCount = await this.reservationRepository.count({
      where: { classId: classOrResource.id, startAt, status: 'confirmed' },
    });
    if (bookedCount >= classOrResource.capacity) {
      throw new BadRequestException('No hay cupo disponible para ese horario.');
    }

    const overlapping = await this.reservationRepository.findOne({
      where: {
        userId: requester.id,
        status: 'confirmed',
        startAt: LessThan(endAt),
        endAt: MoreThan(startAt),
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        'Ya tenés una reserva que se superpone con ese horario.',
      );
    }

    const reservation = this.reservationRepository.create({
      userId: requester.id,
      classId: classOrResource.id,
      startAt,
      endAt,
      status: 'confirmed',
    });
    return await this.reservationRepository.save(reservation);
  }

  async findAll(requester: AuthenticatedUser): Promise<Reservation[]> {
    if (requester.role === 'CLIENT') {
      return await this.reservationRepository.find({
        where: { userId: requester.id },
        relations: { classOrResource: true },
        order: { startAt: 'DESC' },
      });
    }
    if (requester.role === 'SUPER_ADMIN') {
      return await this.reservationRepository.find({
        relations: { classOrResource: true },
        order: { startAt: 'DESC' },
      });
    }
    return await this.reservationRepository.find({
      where: { classOrResource: { gymId: requester.gymId ?? '' } },
      relations: { classOrResource: true },
      order: { startAt: 'DESC' },
    });
  }

  // Cancelar reserva (E3-04) — dueño, o ADMIN/SUPER_ADMIN del gym de la
  // clase, igual que el patrón de MembershipsService.requestCancellation.
  async cancel(id: string, requester: AuthenticatedUser): Promise<Reservation> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: { classOrResource: true },
    });
    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    const isOwner = reservation.userId === requester.id;
    const isGymAdmin =
      requester.role === 'SUPER_ADMIN' ||
      (requester.role === 'ADMIN' &&
        reservation.classOrResource.gymId === requester.gymId);
    if (!isOwner && !isGymAdmin) {
      throw new ForbiddenException('No tenés acceso a esta reserva.');
    }

    if (reservation.status !== 'confirmed') {
      throw new BadRequestException('Esta reserva ya no está confirmada.');
    }

    await this.reservationRepository.update(id, { status: 'cancelled' });

    // Cupo liberado — intenta promover a quien esté primero en la lista de
    // espera de este mismo turno (Fase 1 del roadmap post-v1.5). No bloquea
    // la respuesta de cancelación si algo falla acá; el propio
    // WaitlistService ya maneja sus errores internamente sin propagarlos.
    await this.waitlistService.tryPromote(
      reservation.classId,
      reservation.startAt,
    );

    return await this.reservationRepository.findOneOrFail({
      where: { id },
      relations: { classOrResource: true },
    });
  }

  // Barrido de expiración (E3-04) — las reservas confirmed cuyo horario ya
  // pasó sin cancelarse quedan expired. Update masivo, sin llamada externa
  // de por medio (a diferencia del cron de cancelación de Membership).
  @Cron(CronExpression.EVERY_HOUR)
  async expireReservations(): Promise<void> {
    await this.reservationRepository.update(
      { status: 'confirmed', endAt: LessThanOrEqual(new Date()) },
      { status: 'expired' },
    );
  }
}
