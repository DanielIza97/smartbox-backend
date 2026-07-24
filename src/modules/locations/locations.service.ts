import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './entities/location.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { AuthenticatedUser } from '../auth/types/auth.types';

const DEFAULT_LOCATION_NAME = 'Sucursal Principal';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
  ) {}

  async create(dto: CreateLocationDto): Promise<Location> {
    const gymId = dto.gymId;
    if (!gymId) {
      throw new NotFoundException('gymId es obligatorio.');
    }

    const gym = await this.gymRepository.findOne({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException('El gimnasio especificado no existe.');
    }

    const location = this.locationRepository.create({
      name: dto.name,
      address: dto.address,
      gymId,
    });
    return await this.locationRepository.save(location);
  }

  async findAll(requester: AuthenticatedUser): Promise<Location[]> {
    if (requester.role === 'SUPER_ADMIN') {
      return await this.locationRepository.find();
    }
    return await this.locationRepository.find({
      where: { gymId: requester.gymId ?? '' },
    });
  }

  // Invocado por GymsService.create()/AuthService.signupGym() justo después
  // de guardar el Gym — todo gimnasio nace con una sucursal para que
  // Clases/Turnos/Check-ins nunca queden sin dónde apuntar. Mismos datos
  // que usa la migración AddLocations para backfillear los gimnasios
  // existentes (nombre fijo + address del gym).
  async createDefault(gymId: string, address?: string): Promise<Location> {
    const location = this.locationRepository.create({
      name: DEFAULT_LOCATION_NAME,
      address,
      gymId,
    });
    return await this.locationRepository.save(location);
  }
}
