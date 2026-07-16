import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { Gym } from '../gyms/entities/gym.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
  ) {}

  async create(dto: CreatePlanDto): Promise<Plan> {
    const gymId = dto.gymId;
    if (!gymId) {
      throw new BadRequestException('gymId es obligatorio.');
    }

    const gym = await this.gymRepository.findOne({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException('El gimnasio especificado no existe.');
    }

    const existing = await this.planRepository.findOne({ where: { gymId } });
    if (existing) {
      throw new BadRequestException(
        'Este gimnasio ya tiene un plan. Editá el existente en vez de crear uno nuevo.',
      );
    }

    const plan = this.planRepository.create({
      name: dto.name,
      priceCents: dto.priceCents,
      gymId,
    });
    return await this.planRepository.save(plan);
  }

  async findAll(requester: AuthenticatedUser): Promise<Plan[]> {
    if (requester.role === 'SUPER_ADMIN') {
      return await this.planRepository.find({ relations: { gym: true } });
    }
    return await this.planRepository.find({
      where: { gymId: requester.gymId ?? '' },
      relations: { gym: true },
    });
  }

  async findOne(id: string, requester: AuthenticatedUser): Promise<Plan> {
    const plan = await this.planRepository.findOne({
      where: { id },
      relations: { gym: true },
    });
    if (!plan) {
      throw new NotFoundException(`Plan con ID ${id} no encontrado.`);
    }
    if (requester.role !== 'SUPER_ADMIN' && plan.gymId !== requester.gymId) {
      throw new ForbiddenException('No tenés acceso a este plan.');
    }
    return plan;
  }
}
