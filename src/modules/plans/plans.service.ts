import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { Gym } from '../gyms/entities/gym.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { MercadoPagoService } from '../../common/mercadopago/mercadopago.service';
import { GymsService } from '../gyms/gyms.service';

const TRIAL_PERIOD_DAYS = 14;

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly gymsService: GymsService,
    private readonly configService: ConfigService,
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

    // Modelo Marketplace: el plan se crea en la cuenta de Mercado Pago del
    // propio gimnasio, no en una cuenta de la plataforma — sin conectar,
    // no hay dónde crearlo.
    const accessToken = await this.gymsService.getMercadoPagoAccessToken(gymId);
    const mercadoPagoPlanId = await this.createMercadoPagoPlan(
      accessToken,
      gym.name,
      dto,
    );

    const plan = this.planRepository.create({
      name: dto.name,
      priceCents: dto.priceCents,
      gymId,
      mercadoPagoPlanId,
    });
    return await this.planRepository.save(plan);
  }

  // PreApprovalPlan recurrente mensual en Mercado Pago, con el trial de 14
  // días de la sesión de scoping de billing ya incluido — un PreApprovalPlan
  // por Plan (E6-04: varios Plan por gimnasio, cada uno con su propio
  // PreApprovalPlan en Mercado Pago).
  private async createMercadoPagoPlan(
    gymAccessToken: string,
    gymName: string,
    dto: CreatePlanDto,
  ): Promise<string> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const client = this.mercadoPagoService.clientFor(gymAccessToken);

    try {
      const plan = await client.plans.create({
        body: {
          reason: `${gymName} — ${dto.name}`,
          back_url: `${frontendUrl}/dashboard/membership`,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: dto.priceCents / 100,
            currency_id: 'USD',
            free_trial: {
              frequency: TRIAL_PERIOD_DAYS,
              frequency_type: 'days',
            },
          },
        },
      });
      if (!plan.id) {
        throw new Error('Mercado Pago no devolvió un id de plan.');
      }
      return plan.id;
    } catch {
      throw new BadRequestException(
        'No se pudo crear el plan en Mercado Pago. Verificá que la cuenta del gimnasio siga conectada.',
      );
    }
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
