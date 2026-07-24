import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CheckIn } from './entities/check-in.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { User } from '../users/user.entity';
import { Location } from '../locations/entities/location.entity';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Injectable()
export class CheckInsService {
  constructor(
    @InjectRepository(CheckIn)
    private readonly checkInRepository: Repository<CheckIn>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  // Un CLIENT solo puede registrarse a sí mismo (ignora cualquier userId
  // que mande); STAFF/ADMIN/SUPER_ADMIN registran a otro socio, exigiendo
  // userId y validando que pertenezca a su mismo gimnasio.
  async checkIn(
    dto: CreateCheckInDto,
    requester: AuthenticatedUser,
  ): Promise<CheckIn> {
    let userId: string;
    let gymId: string;

    if (requester.role === 'CLIENT') {
      if (!requester.gymId) {
        throw new BadRequestException(
          'Tu cuenta no pertenece a ningún gimnasio.',
        );
      }
      userId = requester.id;
      gymId = requester.gymId;
    } else {
      if (!dto.userId) {
        throw new BadRequestException('Indicá el socio a registrar (userId).');
      }
      const target = await this.userRepository.findOne({
        where: { id: dto.userId },
        relations: { gym: true },
      });
      if (!target) {
        throw new NotFoundException('Socio no encontrado.');
      }
      const targetGymId = target.gym?.id ?? null;
      if (requester.role !== 'SUPER_ADMIN' && targetGymId !== requester.gymId) {
        throw new ForbiddenException('No tenés acceso a este socio.');
      }
      if (!targetGymId) {
        throw new BadRequestException(
          'Ese usuario no pertenece a ningún gimnasio.',
        );
      }
      userId = target.id;
      gymId = targetGymId;
    }

    let reservationId: string | null = null;
    let locationId: string;

    if (dto.reservationId) {
      const reservation = await this.reservationRepository.findOne({
        where: { id: dto.reservationId },
        relations: { classOrResource: true },
      });
      if (!reservation) {
        throw new NotFoundException('Reserva no encontrada.');
      }
      if (reservation.userId !== userId) {
        throw new ForbiddenException('Esa reserva no pertenece a este socio.');
      }
      if (reservation.status !== 'confirmed') {
        throw new BadRequestException('Esa reserva ya no está confirmada.');
      }
      const alreadyCheckedIn = await this.checkInRepository.findOne({
        where: { reservationId: reservation.id, checkedOutAt: IsNull() },
      });
      if (alreadyCheckedIn) {
        throw new BadRequestException(
          'Ya hay un check-in activo para esta reserva.',
        );
      }
      reservationId = reservation.id;
      // Sucursal heredada de la clase reservada — no se pide en el DTO en
      // este camino (Fase 1 post-v1.5, sucursales).
      locationId = reservation.classOrResource.locationId;
    } else {
      // Check-in walk-in (sin reserva, gimnasio libre) — la sucursal no se
      // puede inferir de ningún lado, así que se exige explícita.
      if (!dto.locationId) {
        throw new BadRequestException(
          'Indicá la sucursal (locationId) para un check-in sin reserva.',
        );
      }
      const location = await this.locationRepository.findOne({
        where: { id: dto.locationId },
      });
      if (!location || location.gymId !== gymId) {
        throw new ForbiddenException('No tenés acceso a esa sucursal.');
      }
      locationId = location.id;
    }

    const checkIn = this.checkInRepository.create({
      userId,
      gymId,
      locationId,
      reservationId,
      checkedInAt: new Date(),
    });
    return await this.checkInRepository.save(checkIn);
  }

  async checkOut(id: string, requester: AuthenticatedUser): Promise<CheckIn> {
    const checkIn = await this.checkInRepository.findOne({ where: { id } });
    if (!checkIn) {
      throw new NotFoundException('Check-in no encontrado.');
    }

    const isOwner = checkIn.userId === requester.id;
    const isGymAdmin =
      requester.role === 'SUPER_ADMIN' ||
      ((requester.role === 'ADMIN' || requester.role === 'STAFF') &&
        checkIn.gymId === requester.gymId);
    if (!isOwner && !isGymAdmin) {
      throw new ForbiddenException('No tenés acceso a este check-in.');
    }

    if (checkIn.checkedOutAt) {
      throw new BadRequestException(
        'Este check-in ya tiene check-out registrado.',
      );
    }

    await this.checkInRepository.update(id, { checkedOutAt: new Date() });
    return await this.checkInRepository.findOneOrFail({ where: { id } });
  }

  async findAll(requester: AuthenticatedUser): Promise<CheckIn[]> {
    if (requester.role === 'CLIENT') {
      return await this.checkInRepository.find({
        where: { userId: requester.id },
        relations: { location: true },
        order: { checkedInAt: 'DESC' },
      });
    }
    if (requester.role === 'SUPER_ADMIN') {
      return await this.checkInRepository.find({
        relations: { location: true },
        order: { checkedInAt: 'DESC' },
      });
    }
    return await this.checkInRepository.find({
      where: { gymId: requester.gymId ?? '' },
      relations: { location: true },
      order: { checkedInAt: 'DESC' },
    });
  }
}
