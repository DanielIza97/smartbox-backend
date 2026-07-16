import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Membership } from './entities/membership.entity';
import { Plan } from '../plans/entities/plan.entity';
import { MercadoPagoService } from '../../common/mercadopago/mercadopago.service';
import { GymsService } from '../gyms/gyms.service';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly gymsService: GymsService,
    private readonly configService: ConfigService,
  ) {}

  // Crea una suscripción (PreApproval) en estado 'pending' en la cuenta de
  // Mercado Pago del GIMNASIO (modelo Marketplace, no de la plataforma) —
  // Mercado Pago devuelve un init_point hosted para que el socio cargue su
  // tarjeta ahí. La Membership se crea recién cuando el webhook confirme la
  // suscripción (E2-03), no acá. Sesión de scoping de billing: alta solo
  // self-service con tarjeta, sin alta manual/offline por ADMIN.
  async subscribe(
    requester: AuthenticatedUser,
  ): Promise<{ checkoutUrl: string }> {
    if (!requester.gymId) {
      throw new BadRequestException(
        'Tu cuenta no pertenece a ningún gimnasio.',
      );
    }

    const plan = await this.planRepository.findOne({
      where: { gymId: requester.gymId },
    });
    if (!plan) {
      throw new NotFoundException(
        'Tu gimnasio todavía no tiene un plan de membresía configurado.',
      );
    }

    const existing = await this.membershipRepository.findOne({
      where: { userId: requester.id, status: In(['active', 'past_due']) },
    });
    if (existing) {
      throw new BadRequestException('Ya tenés una membresía activa.');
    }

    const accessToken = await this.gymsService.getMercadoPagoAccessToken(
      requester.gymId,
    );
    const client = this.mercadoPagoService.clientFor(accessToken);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    try {
      const subscription = await client.subscriptions.create({
        body: {
          preapproval_plan_id: plan.mercadoPagoPlanId!,
          payer_email: requester.email,
          external_reference: requester.id,
          back_url: `${frontendUrl}/dashboard/membership`,
          status: 'pending',
        },
      });

      if (!subscription.init_point) {
        throw new Error('Mercado Pago no devolvió un init_point.');
      }
      return { checkoutUrl: subscription.init_point };
    } catch {
      throw new BadRequestException(
        'No se pudo iniciar la suscripción en Mercado Pago. Intentá de nuevo en unos minutos.',
      );
    }
  }
}
