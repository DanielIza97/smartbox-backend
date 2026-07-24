import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gym } from './entities/gym.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { CreateGymDto } from './dto/create-gym.dto';
import { MercadoPagoService } from '../../common/mercadopago/mercadopago.service';
import { LocationsService } from '../locations/locations.service';

export interface GymWithStats extends Gym {
  activeMembersCount: number;
}

@Injectable()
export class GymsService {
  constructor(
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly locationsService: LocationsService,
  ) {}

  // Sucursales (Fase 1 post-v1.5) — todo Gym nuevo nace con una Location
  // "Sucursal Principal" (misma lógica que usa AuthService.signupGym() para
  // el alta self-serve) para que Clases/Turnos/Check-ins nunca queden sin
  // dónde apuntar. Sin transacción explícita: mismo criterio de riesgo
  // aceptado que el resto del código no-transaccional de este repo.
  async create(dto: CreateGymDto): Promise<Gym> {
    const gym = this.gymRepository.create(dto);
    const savedGym = await this.gymRepository.save(gym);
    await this.locationsService.createDefault(savedGym.id, savedGym.address);
    return savedGym;
  }

  // Panel multi-tenant para SUPER_ADMIN (E6-05, segunda mitad) — un solo
  // query agrupado para los socios activos de todos los gimnasios, en vez
  // de un count por gym (evita N+1). Alcance acotado a esta única métrica,
  // sesión de scoping con el usuario, 2026-07-20.
  async findAll(): Promise<GymWithStats[]> {
    const gyms = await this.gymRepository.find();
    if (gyms.length === 0) {
      return [];
    }

    const counts = await this.membershipRepository
      .createQueryBuilder('membership')
      .innerJoin('membership.plan', 'plan')
      .select('plan.gym_id', 'gymId')
      .addSelect('COUNT(*)', 'count')
      .where('membership.status = :status', { status: 'active' })
      .groupBy('plan.gym_id')
      .getRawMany<{ gymId: string; count: string }>();

    const countByGymId = new Map(
      counts.map((row) => [row.gymId, parseInt(row.count, 10)]),
    );

    return gyms.map((gym) => ({
      ...gym,
      activeMembersCount: countByGymId.get(gym.id) ?? 0,
    }));
  }

  async findOne(id: string): Promise<Gym> {
    const gym = await this.gymRepository.findOne({ where: { id } });
    if (!gym) {
      throw new NotFoundException(`Gimnasio con ID ${id} no encontrado.`);
    }
    return gym;
  }

  // Modelo Marketplace sin Aplicación centralizada (ver mercadopago.service.ts):
  // el gimnasio pega el access token que generó en su propia cuenta de
  // Mercado Pago, junto con el secreto de firma de su propio webhook.
  // Se valida contra GET /users/me antes de guardar nada — un token
  // inválido/revocado nunca deja al gimnasio en un estado "conectado" a
  // medias.
  async connectMercadoPago(
    id: string,
    accessToken: string,
    webhookSecret: string,
  ): Promise<Gym> {
    await this.findOne(id);

    let userId: string;
    try {
      ({ userId } =
        await this.mercadoPagoService.verifyAccessToken(accessToken));
    } catch {
      throw new BadRequestException(
        'El access token no es válido o fue revocado. Generá uno nuevo desde tu cuenta de Mercado Pago.',
      );
    }

    await this.gymRepository.update(id, {
      mercadoPagoUserId: userId,
      mercadoPagoAccessToken: accessToken,
      mercadoPagoWebhookSecret: webhookSecret,
    });

    return await this.findOne(id);
  }

  // Uso interno de Plans/Memberships — el access_token está oculto por
  // default (select: false), así que hay que pedirlo explícitamente acá.
  async getMercadoPagoAccessToken(gymId: string): Promise<string> {
    const gym = await this.gymRepository
      .createQueryBuilder('gym')
      .addSelect('gym.mercadoPagoAccessToken')
      .where('gym.id = :gymId', { gymId })
      .getOne();

    if (!gym?.mercadoPagoAccessToken) {
      throw new BadRequestException(
        'Este gimnasio todavía no conectó su cuenta de Mercado Pago.',
      );
    }
    return gym.mercadoPagoAccessToken;
  }

  // Uso interno del webhook (MembershipsService.handleWebhook) — cada
  // gimnasio tiene su propio secreto de firma, así que hay que resolver
  // primero a qué gimnasio pertenece la notificación (vía user_id) antes
  // de poder verificarla.
  async getMercadoPagoWebhookSecret(gymId: string): Promise<string> {
    const gym = await this.gymRepository
      .createQueryBuilder('gym')
      .addSelect('gym.mercadoPagoWebhookSecret')
      .where('gym.id = :gymId', { gymId })
      .getOne();

    if (!gym?.mercadoPagoWebhookSecret) {
      throw new BadRequestException(
        'Este gimnasio no tiene un secreto de webhook de Mercado Pago configurado.',
      );
    }
    return gym.mercadoPagoWebhookSecret;
  }

  // Usado por el webhook de Mercado Pago (E2-03) para averiguar a qué
  // gimnasio pertenece una notificación — el payload trae el user_id de
  // Mercado Pago del vendedor, no el gymId de SmartBox.
  async findByMercadoPagoUserId(
    mercadoPagoUserId: string,
  ): Promise<Gym | null> {
    return await this.gymRepository.findOne({
      where: { mercadoPagoUserId },
    });
  }
}
