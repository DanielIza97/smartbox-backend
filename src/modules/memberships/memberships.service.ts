import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { WebhookSignatureValidator } from 'mercadopago';
import { Membership } from './entities/membership.entity';
import { ProcessedWebhookEvent } from './entities/processed-webhook-event.entity';
import { Invoice } from './entities/invoice.entity';
import { PendingSubscription } from './entities/pending-subscription.entity';
import { Plan } from '../plans/entities/plan.entity';
import { User } from '../users/user.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import {
  GymMercadoPagoClient,
  MercadoPagoService,
} from '../../common/mercadopago/mercadopago.service';
import { GymsService } from '../gyms/gyms.service';
import { AuthenticatedUser } from '../auth/types/auth.types';

type PreApprovalDetails = Awaited<
  ReturnType<GymMercadoPagoClient['subscriptions']['get']>
>;
type PaymentDetails = Awaited<
  ReturnType<GymMercadoPagoClient['payments']['get']>
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

// Eventos de cobro recurrente (dunning, E2-05) — confirmado contra la
// documentación oficial de Mercado Pago: el topic es
// `subscription_authorized_payment`, distinto del topic genérico `payment`
// de pagos únicos. La cadencia/cantidad de reintentos automáticos de
// Mercado Pago no está documentada públicamente — no la replicamos acá,
// solo reaccionamos a los eventos que Mercado Pago decida mandar.
const PAYMENT_WEBHOOK_TYPES = ['subscription_authorized_payment'];

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
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(PendingSubscription)
    private readonly pendingSubscriptionRepository: Repository<PendingSubscription>,
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
    dto: CreateSubscriptionDto,
    requester: AuthenticatedUser,
  ): Promise<{ checkoutUrl: string }> {
    if (!requester.gymId) {
      throw new BadRequestException(
        'Tu cuenta no pertenece a ningún gimnasio.',
      );
    }

    const plan = await this.planRepository.findOne({
      where: { id: dto.planId },
    });
    if (!plan) {
      throw new NotFoundException('El plan especificado no existe.');
    }
    if (plan.gymId !== requester.gymId) {
      throw new ForbiddenException('Ese plan no pertenece a tu gimnasio.');
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

      if (!subscription.init_point || !subscription.id) {
        throw new Error('Mercado Pago no devolvió un init_point/id.');
      }

      // E6-04: con varios Plan por gimnasio, el webhook que confirma esta
      // suscripción (subscription_preapproval → authorized) necesita saber
      // a cuál Plan corresponde — PreApprovalResponse no devuelve
      // preapproval_plan_id, así que lo guardamos acá.
      await this.pendingSubscriptionRepository.save(
        this.pendingSubscriptionRepository.create({
          mercadoPagoPreapprovalId: subscription.id,
          planId: plan.id,
        }),
      );

      return { checkoutUrl: subscription.init_point };
    } catch {
      throw new BadRequestException(
        'No se pudo iniciar la suscripción en Mercado Pago. Intentá de nuevo en unos minutos.',
      );
    }
  }

  // E2-07: autogestión de solo lectura — Mercado Pago no tiene un Customer
  // Portal hosted por-comercio como Stripe, así que en vez de linkear a un
  // portal, el socio ve su estado desde acá y gestiona tarjeta/cancelación
  // de suscripción directamente en su propia cuenta de Mercado Pago (débitos
  // automáticos). Cancelar sigue siendo POST /memberships/:id/cancel (E2-04).
  async findMyMembership(requester: AuthenticatedUser): Promise<Membership> {
    const membership = await this.membershipRepository.findOne({
      where: { userId: requester.id },
      relations: { plan: true },
      order: { createdAt: 'DESC' },
    });
    if (!membership) {
      throw new NotFoundException('Todavía no tenés una membresía.');
    }
    return membership;
  }

  async findMyInvoices(requester: AuthenticatedUser): Promise<Invoice[]> {
    const memberships = await this.membershipRepository.find({
      where: { userId: requester.id },
    });
    if (memberships.length === 0) {
      return [];
    }

    return this.invoiceRepository.find({
      where: { membershipId: In(memberships.map((m) => m.id)) },
      order: { createdAt: 'DESC' },
    });
  }

  // Webhook de Mercado Pago: verifica firma, deduplica por notification id
  // (INSERT con PK única — no "leer y después insertar", para no dejar una
  // carrera entre notificaciones concurrentes), y sincroniza el estado de
  // la Membership contra el recurso real en la API (nunca confiamos en el
  // body de la notificación como fuente de verdad, solo como aviso de
  // "algo cambió, andá a mirar"). Maneja dos topics: `subscription_preapproval`
  // (alta/cancelación) y `subscription_authorized_payment` (cobro recurrente,
  // dunning — E2-05); el topic genérico `payment` no aplica acá.
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
    const isPreapprovalEvent = PREAPPROVAL_WEBHOOK_TYPES.includes(
      payload.type ?? '',
    );
    const isPaymentEvent = PAYMENT_WEBHOOK_TYPES.includes(payload.type ?? '');
    if (
      !dataId ||
      payload.user_id == null ||
      (!isPreapprovalEvent && !isPaymentEvent)
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

    if (isPreapprovalEvent) {
      const subscription = await client.subscriptions.get({ id: dataId });
      await this.syncMembershipFromPreapproval(subscription);
    } else {
      const payment = await client.payments.get({ id: dataId });
      await this.syncMembershipFromPayment(payment);
    }
  }

  // Cancelación "hasta fin del período pagado" (sesión de scoping de
  // billing) — Mercado Pago no tiene un cancel_at_period_end nativo como
  // Stripe, así que lo simulamos a nivel de aplicación: acá solo marcamos
  // la intención; la cancelación real en Mercado Pago recién ocurre cuando
  // vence currentPeriodEnd (ver processScheduledCancellations más abajo).
  async requestCancellation(
    membershipId: string,
    requester: AuthenticatedUser,
  ): Promise<Membership> {
    const membership = await this.membershipRepository.findOne({
      where: { id: membershipId },
      relations: { plan: true },
    });
    if (!membership) {
      throw new NotFoundException('Membresía no encontrada.');
    }

    const isOwner = membership.userId === requester.id;
    const isGymAdmin =
      requester.role === 'SUPER_ADMIN' ||
      (requester.role === 'ADMIN' && membership.plan.gymId === requester.gymId);
    if (!isOwner && !isGymAdmin) {
      throw new ForbiddenException('No tenés acceso a esta membresía.');
    }

    if (membership.status !== 'active') {
      throw new BadRequestException('Esta membresía no está activa.');
    }
    if (membership.cancelAtPeriodEnd) {
      throw new BadRequestException(
        'Esta membresía ya tiene una cancelación pendiente.',
      );
    }

    await this.membershipRepository.update(membership.id, {
      cancelAtPeriodEnd: true,
    });
    return await this.membershipRepository.findOneOrFail({
      where: { id: membership.id },
      relations: { plan: true },
    });
  }

  // Barrido diario: efectiviza en Mercado Pago las cancelaciones pedidas
  // cuyo período pagado ya venció. Si la cancelación remota falla, deja
  // cancelAtPeriodEnd=true para reintentar en el próximo barrido en vez de
  // perder el pedido silenciosamente.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processScheduledCancellations(): Promise<void> {
    const due = await this.membershipRepository.find({
      where: {
        cancelAtPeriodEnd: true,
        status: 'active',
        currentPeriodEnd: LessThanOrEqual(new Date()),
      },
      relations: { plan: true },
    });

    for (const membership of due) {
      await this.finalizeCancellation(membership);
    }
  }

  private async finalizeCancellation(membership: Membership): Promise<void> {
    if (!membership.mercadoPagoPreapprovalId) {
      await this.membershipRepository.update(membership.id, {
        status: 'cancelled',
      });
      return;
    }

    try {
      const accessToken = await this.gymsService.getMercadoPagoAccessToken(
        membership.plan.gymId,
      );
      const client = this.mercadoPagoService.clientFor(accessToken);
      await client.subscriptions.update({
        id: membership.mercadoPagoPreapprovalId,
        body: { status: 'cancelled' },
      });
      await this.membershipRepository.update(membership.id, {
        status: 'cancelled',
      });
    } catch (error) {
      this.logger.error(
        `No se pudo cancelar la membresía ${membership.id} en Mercado Pago — se reintenta en el próximo barrido.`,
        error,
      );
    }
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

    // E6-04: varios Plan por gimnasio — resolvemos vía la PendingSubscription
    // guardada en subscribe(), no vía gymId (ya no identifica un Plan único).
    const pending = await this.pendingSubscriptionRepository.findOne({
      where: { mercadoPagoPreapprovalId: subscription.id },
    });
    if (!pending) {
      return;
    }

    const plan = await this.planRepository.findOne({
      where: { id: pending.planId },
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

  // Dunning (E2-05): un cobro recurrente rechazado pasa la Membership a
  // past_due sin cortar el acceso de inmediato (sesión de scoping de
  // billing); uno aprobado la vuelve a active. No replicamos acá la
  // cadencia de reintentos de Mercado Pago (no está documentada
  // públicamente) — si Mercado Pago termina cancelando el PreApproval
  // tras agotar sus propios reintentos, el evento subscription_preapproval
  // que ya manejamos arriba se encarga de marcar cancelled.
  //
  // Correlación pago → Membership vía external_reference, asumiendo que
  // Mercado Pago copia el external_reference del PreApproval a los pagos
  // recurrentes que genera — no confirmado contra tráfico real todavía,
  // ver CLAUDE.md.
  private async syncMembershipFromPayment(
    payment: PaymentDetails,
  ): Promise<void> {
    if (!payment.external_reference) {
      return;
    }

    const membership = await this.membershipRepository.findOne({
      where: {
        userId: payment.external_reference,
        status: In(['active', 'past_due']),
      },
    });
    if (!membership) {
      return;
    }

    await this.recordInvoice(membership.id, payment);

    if (payment.status === 'approved' && membership.status === 'past_due') {
      await this.membershipRepository.update(membership.id, {
        status: 'active',
      });
      return;
    }

    if (payment.status === 'rejected' && membership.status === 'active') {
      await this.membershipRepository.update(membership.id, {
        status: 'past_due',
      });
    }
  }

  // Registro interno de facturas (E2-06) — upsert por mercadoPagoPaymentId
  // porque Mercado Pago puede notificar más de una vez el mismo Payment
  // (p. ej. creado y luego actualizado a su estado final); nunca queremos
  // dos filas para el mismo cobro. Sin UI de historial ni endpoint propio
  // en v1.0 — es la fuente de datos para reportes de Epic 4.
  private async recordInvoice(
    membershipId: string,
    payment: PaymentDetails,
  ): Promise<void> {
    if (!payment.id) {
      return;
    }

    const mercadoPagoPaymentId = String(payment.id);
    const amountCents =
      typeof payment.transaction_amount === 'number'
        ? Math.round(payment.transaction_amount * 100)
        : 0;
    const paidAt = payment.date_approved
      ? new Date(payment.date_approved)
      : null;
    const status = payment.status ?? 'unknown';

    const existing = await this.invoiceRepository.findOne({
      where: { mercadoPagoPaymentId },
    });
    if (existing) {
      await this.invoiceRepository.update(existing.id, {
        status,
        amountCents,
        paidAt,
      });
      return;
    }

    await this.invoiceRepository.save(
      this.invoiceRepository.create({
        membershipId,
        mercadoPagoPaymentId,
        amountCents,
        status,
        paidAt,
      }),
    );
  }
}
