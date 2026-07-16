import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gym } from './entities/gym.entity';
import { CreateGymDto } from './dto/create-gym.dto';
import { MercadoPagoService } from '../../common/mercadopago/mercadopago.service';
import { TokenService } from '../../common/token/token.service';

@Injectable()
export class GymsService {
  constructor(
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly tokenService: TokenService,
  ) {}

  async create(dto: CreateGymDto): Promise<Gym> {
    const gym = this.gymRepository.create(dto);
    return await this.gymRepository.save(gym);
  }

  async findAll(): Promise<Gym[]> {
    return await this.gymRepository.find();
  }

  async findOne(id: string): Promise<Gym> {
    const gym = await this.gymRepository.findOne({ where: { id } });
    if (!gym) {
      throw new NotFoundException(`Gimnasio con ID ${id} no encontrado.`);
    }
    return gym;
  }

  // Modelo Marketplace: arranca el handshake OAuth para que ESTE gimnasio
  // conecte su propia cuenta de Mercado Pago — la plata de sus socios va
  // directo ahí, no a una cuenta de SmartBox.
  async startMercadoPagoConnect(
    id: string,
  ): Promise<{ authorizationUrl: string }> {
    await this.findOne(id);

    const { token, expiresAt } = this.tokenService.generate(1);
    await this.gymRepository.update(id, {
      mercadoPagoOauthState: token,
      mercadoPagoOauthStateExpiresAt: expiresAt,
    });

    return {
      authorizationUrl: this.mercadoPagoService.getAuthorizationUrl(token),
    };
  }

  // Mercado Pago redirige acá después de que el dueño del gym autoriza —
  // el state (no el gymId de la URL) es lo único confiable para identificar
  // a qué gimnasio corresponde este code, así evitamos que alguien pise la
  // conexión de otro gimnasio adivinando ids.
  async completeMercadoPagoConnect(code: string, state: string): Promise<Gym> {
    const gym = await this.gymRepository
      .createQueryBuilder('gym')
      .addSelect('gym.mercadoPagoOauthState')
      .addSelect('gym.mercadoPagoOauthStateExpiresAt')
      .where('gym.mercadopago_oauth_state = :state', { state })
      .getOne();

    if (
      !gym ||
      this.tokenService.isExpired(gym.mercadoPagoOauthStateExpiresAt ?? null)
    ) {
      throw new BadRequestException(
        'El enlace de conexión con Mercado Pago es inválido o expiró. Iniciá la conexión de nuevo.',
      );
    }

    const tokens = await this.mercadoPagoService.exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new BadRequestException(
        'Mercado Pago no devolvió credenciales válidas.',
      );
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await this.gymRepository.update(gym.id, {
      mercadoPagoUserId: tokens.user_id ? String(tokens.user_id) : null,
      mercadoPagoAccessToken: tokens.access_token,
      mercadoPagoRefreshToken: tokens.refresh_token,
      mercadoPagoTokenExpiresAt: expiresAt,
      mercadoPagoOauthState: null,
      mercadoPagoOauthStateExpiresAt: null,
    });

    return await this.findOne(gym.id);
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
}
