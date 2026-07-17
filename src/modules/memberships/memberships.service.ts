import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WebhookSignatureValidator } from 'mercadopago';
import { Membership } from './entities/membership.entity';
import { ProcessedWebhookEvent } from './entities/processed-webhook-event.entity';
import { Plan } from '../plans/entities/plan.entity';
import { User } from '../users/user.entity';
import {
  GymMercadoPagoClient,
  MercadoPagoService,
} from '../../common/mercadopago/mercadopago.service';
import { GymsService } from '../gyms/gyms.service';
import { AuthenticatedUser } from '../auth/types/auth.types';

type PreApprovalDetails = Awaited<
  ReturnType<GymMercadoPagoClient['subscriptions']['get']>
>;

export interface MercadoPagoWebhookPayload {
  id?: number | string;
  type?: string;
  action?: string;
  data?: { id?: string };
  user_id?: number | string;
}

export interface MercadoPagoWebhookHeaders {
  xSignature?: string;
  xRequestId?: string;
}

// Eventos de PreApproval reportan cambios de estado de la suscripción; el
// tipo exacto que envía Mercado Pago no está 100% confirmado contra tráfico
// real todavía (queda pendiente verificarlo en sandbox), así que aceptamos
// las variantes documentadas/conocidas en vez de una sola cadena fija.
const PREAPPROVAL_WEBHOOK_TYPES = ['subscription_preapproval', 'preapproval'];

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ProcessedWebhookEvent)
    private readonly webhookEventRepository: Repository<ProcessedWebhookEvent>,
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

  // Webhook de Mercado Pago: verifica firma, deduplica por notification id
  // (INSERT con PK única — no "leer y después insertar", para no dejar una
  // carrera entre notificaciones concurrentes), y sincroniza el estado de
  // la Membership contra el PreApproval real en la API (nunca confiamos en
  // el body de la notificación como fuente de verdad, solo como aviso de
  // "algo cambió, andá a mirar"). Eventos de topic `payment` (dunning) se
  // ignoran acá a propósito — eso es E2-05.
  async handleWebhook(
    payload: MercadoPagoWebhookPayload,
    headers: MercadoPagoWebhookHeaders,
  ): Promise<void> {
    this.verifySignature(payload.data?.id, headers);

    const notificationId =
      payload.id !== undefined && payload.id !== null
        ? String(payload.id)
        : undefined;
    if (!notificationId) {
      return;
    }

    try {
      await this.webhookEventRepository.insert({
        id: notificationId,
        type: payload.type ?? 'unknown',
      });
    } catch {
      this.logger.debug(
        `Webhook ${notificationId} ya procesado, ignorando reintento.`,
      );
      return;
    }

    const dataId = payload.data?.id;
    if (
      !dataId ||
      payload.user_id == null ||
      !PREAPPROVAL_WEBHOOK_TYPES.includes(payload.type ?? '')
    ) {
      return;
    }

    const gym = await this.gymsService.findByMercadoPagoUserId(
      String(payload.user_id),
    );
    if (!gym) {
      this.logger.warn(
        `Webhook de Mercado Pago para un user_id sin gimnasio conectado: ${payload.user_id}`,
      );
      return;
    }

    const accessToken = await this.gymsService.getMercadoPagoAccessToken(
      gym.id,
    );
    const client = this.mercadoPagoService.clientFor(accessToken);
    const subscription = await client.subscriptions.get({ id: dataId });

    await this.syncMembershipFromPreapproval(subscription);
  }

  private verifySignature(
    dataId: string | undefined,
    headers: MercadoPagoWebhookHeaders,
  ): void {
    try {
      WebhookSignatureValidator.validate({
        xSignature: headers.xSignature,
        xRequestId: headers.xRequestId,
        dataId,
        secret: this.configService.getOrThrow<string>(
          'MERCADOPAGO_WEBHOOK_SECRET',
        ),
      });
    } catch {
      throw new UnauthorizedException('Firma de webhook inválida.');
    }
  }

  private async syncMembershipFromPreapproval(
    subscription: PreApprovalDetails,
  ): Promise<void> {
    if (!subscription.id) {
      return;
    }

    const existing = await this.membershipRepository.findOne({
      where: { mercadoPagoPreapprovalId: subscription.id },
    });

    if (subscription.status === 'cancelled') {
      if (existing) {
        await this.membershipRepository.update(existing.id, {
          status: 'cancelled',
        });
      }
      return;
    }

    if (subscription.status !== 'authorized') {
      return;
    }

    const currentPeriodEnd = subscription.next_payment_date
      ? new Date(subscription.next_payment_date)
      : null;

    if (existing) {
      await this.membershipRepository.update(existing.id, {
        status: 'active',
        currentPeriodEnd: currentPeriodEnd ?? existing.currentPeriodEnd,
      });
      return;
    }

    if (!subscription.external_reference) {
      return;
    }

    const user = await this.userRepository.findOne({
      where: { id: subscription.external_reference },
      relations: { gym: true },
    });
    if (!user?.gym) {
      return;
    }

    const plan = await this.planRepository.findOne({
      where: { gymId: user.gym.id },
    });
    if (!plan) {
      return;
    }

    const membership = this.membershipRepository.create({
      userId: user.id,
      planId: plan.id,
      status: 'active',
      mercadoPagoPreapprovalId: subscription.id,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    });
    await this.membershipRepository.save(membership);
  }
}
