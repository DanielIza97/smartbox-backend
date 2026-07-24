import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { User } from '../users/user.entity';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { isValidOccurrence } from '../classes/occurrence.util';
import { MailService } from '../mail/mail.service';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly waitlistRepository: Repository<WaitlistEntry>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(ClassOrResource)
    private readonly classRepository: Repository<ClassOrResource>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  // Mismas validaciones iniciales que ReservationsService.create, pero acá
  // se exige que el turno esté LLENO en vez de rechazar por falta de cupo —
  // si hay cupo, el socio debería reservar directamente, no anotarse.
  async join(
    dto: JoinWaitlistDto,
    requester: AuthenticatedUser,
  ): Promise<WaitlistEntry> {
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
        'Necesitás una membresía activa para anotarte en la lista de espera.',
      );
    }

    const startAt = new Date(dto.startAt);
    if (startAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'No podés anotarte a un horario que ya pasó.',
      );
    }
    if (!isValidOccurrence(classOrResource, startAt)) {
      throw new BadRequestException(
        'Ese horario no corresponde a un turno válido de esta clase.',
      );
    }

    const bookedCount = await this.reservationRepository.count({
      where: { classId: classOrResource.id, startAt, status: 'confirmed' },
    });
    if (bookedCount < classOrResource.capacity) {
      throw new BadRequestException(
        'Hay cupo disponible, reservá directamente.',
      );
    }

    const alreadyReserved = await this.reservationRepository.findOne({
      where: {
        userId: requester.id,
        classId: classOrResource.id,
        startAt,
        status: 'confirmed',
      },
    });
    if (alreadyReserved) {
      throw new BadRequestException(
        'Ya tenés una reserva confirmada para ese horario.',
      );
    }

    const alreadyWaiting = await this.waitlistRepository.findOne({
      where: { userId: requester.id, classId: classOrResource.id, startAt },
    });
    if (alreadyWaiting) {
      throw new BadRequestException(
        'Ya estás en la lista de espera de ese horario.',
      );
    }

    const entry = this.waitlistRepository.create({
      userId: requester.id,
      classId: classOrResource.id,
      startAt,
    });
    return await this.waitlistRepository.save(entry);
  }

  async leave(id: string, requester: AuthenticatedUser): Promise<void> {
    const entry = await this.waitlistRepository.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Entrada de lista de espera no encontrada.');
    }

    const isOwner = entry.userId === requester.id;
    const isGymAdmin =
      requester.role === 'SUPER_ADMIN' || requester.role === 'ADMIN';
    if (!isOwner && !isGymAdmin) {
      throw new ForbiddenException('No tenés acceso a esta entrada.');
    }

    await this.waitlistRepository.delete(id);
  }

  async findMine(requester: AuthenticatedUser): Promise<WaitlistEntry[]> {
    return await this.waitlistRepository.find({
      where: { userId: requester.id },
      relations: { classOrResource: true },
      order: { createdAt: 'ASC' },
    });
  }

  // Invocado por ReservationsService.cancel() después de liberar un cupo.
  // Busca la entrada más antigua (FIFO), revalida (puede haber cambiado
  // desde que se anotó) y si pasa crea la Reservation. Si la revalidación
  // falla, borra esa entrada igual (no se puede promover) y sigue con la
  // siguiente — bucle acotado por la cantidad de entradas, no recursivo.
  async tryPromote(classId: string, startAt: Date): Promise<void> {
    let promoted = false;
    while (!promoted) {
      const next = await this.waitlistRepository.findOne({
        where: { classId, startAt },
        order: { createdAt: 'ASC' },
      });
      if (!next) {
        return;
      }

      const membership = await this.membershipRepository.findOne({
        where: { userId: next.userId, status: 'active' },
      });
      const endAt = await this.computeEndAt(classId, startAt);
      const overlapping =
        membership && endAt
          ? await this.reservationRepository.findOne({
              where: {
                userId: next.userId,
                status: 'confirmed',
                startAt: LessThan(endAt),
                endAt: MoreThan(startAt),
              },
            })
          : null;

      if (!membership || !endAt || overlapping) {
        this.logger.warn(
          `No se pudo promover a ${next.userId} de la lista de espera (membresía inactiva o solapamiento) — se descarta la entrada.`,
        );
        await this.waitlistRepository.delete(next.id);
        continue;
      }

      const reservation = this.reservationRepository.create({
        userId: next.userId,
        classId,
        startAt,
        endAt,
        status: 'confirmed',
      });
      await this.reservationRepository.save(reservation);
      await this.waitlistRepository.delete(next.id);
      promoted = true;

      const [user, classOrResource] = await Promise.all([
        this.userRepository.findOne({ where: { id: next.userId } }),
        this.classRepository.findOne({ where: { id: classId } }),
      ]);
      if (user && classOrResource) {
        await this.mailService.sendWaitlistPromotedEmail(
          user.email,
          classOrResource.name,
          startAt,
        );
      }
    }
  }

  private async computeEndAt(
    classId: string,
    startAt: Date,
  ): Promise<Date | null> {
    const classOrResource = await this.classRepository.findOne({
      where: { id: classId },
    });
    if (!classOrResource) {
      return null;
    }
    return new Date(
      startAt.getTime() + classOrResource.durationMinutes * 60_000,
    );
  }
}
