import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { Shift } from './entities/shift.entity';
import { CreateShiftDto } from './dto/create-shift.dto';
import { User } from '../users/user.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // Alta de turno (E4-02) — el gimnasio se resuelve transitivamente vía el
  // STAFF dueño del turno, no se recibe como parámetro. Valida, en orden:
  // el usuario existe y es STAFF, pertenece al gimnasio del solicitante
  // (SUPER_ADMIN sin restricción), startTime < endTime, y no se superpone
  // con otro turno del mismo STAFF.
  async create(
    dto: CreateShiftDto,
    requester: AuthenticatedUser,
  ): Promise<Shift> {
    const staff = await this.userRepository.findOne({
      where: { id: dto.staffId },
      relations: { role: true, gym: true },
    });
    if (!staff) {
      throw new NotFoundException('El usuario especificado no existe.');
    }
    if (staff.role?.name !== 'STAFF') {
      throw new BadRequestException(
        'El usuario especificado no tiene rol STAFF.',
      );
    }
    if (requester.role !== 'SUPER_ADMIN' && staff.gym?.id !== requester.gymId) {
      throw new ForbiddenException('No tenés acceso a este miembro del staff.');
    }

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime debe ser anterior a endTime.');
    }

    const overlapping = await this.shiftRepository.findOne({
      where: {
        staffId: dto.staffId,
        dayOfWeek: dto.dayOfWeek,
        startTime: LessThan(dto.endTime),
        endTime: MoreThan(dto.startTime),
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        'Ese turno se superpone con otro turno existente del mismo STAFF.',
      );
    }

    const shift = this.shiftRepository.create({
      staffId: dto.staffId,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
    });
    return await this.shiftRepository.save(shift);
  }

  async findAll(requester: AuthenticatedUser): Promise<Shift[]> {
    if (requester.role === 'SUPER_ADMIN') {
      return await this.shiftRepository.find({
        relations: { staff: { gym: true } },
      });
    }
    return await this.shiftRepository.find({
      where: { staff: { gym: { id: requester.gymId ?? '' } } },
      relations: { staff: { gym: true } },
    });
  }

  async findOne(id: string, requester: AuthenticatedUser): Promise<Shift> {
    const shift = await this.shiftRepository.findOne({
      where: { id },
      relations: { staff: { gym: true } },
    });
    if (!shift) {
      throw new NotFoundException(`Turno con ID ${id} no encontrado.`);
    }
    if (
      requester.role !== 'SUPER_ADMIN' &&
      shift.staff.gym?.id !== requester.gymId
    ) {
      throw new ForbiddenException('No tenés acceso a este turno.');
    }
    return shift;
  }
}
