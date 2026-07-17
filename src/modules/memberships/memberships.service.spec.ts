import * as crypto from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { MembershipsService } from './memberships.service';
import { Membership } from './entities/membership.entity';
import { ProcessedWebhookEvent } from './entities/processed-webhook-event.entity';
import { Plan } from '../plans/entities/plan.entity';
import { User } from '../users/user.entity';
import { MercadoPagoService } from '../../common/mercadopago/mercadopago.service';
import { GymsService } from '../gyms/gyms.service';
import { AuthenticatedUser } from '../auth/types/auth.types';

const WEBHOOK_SECRET = 'webhook-secret-for-tests';

function signWebhook(dataId: string, requestId: string, ts: number) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');
  return `ts=${ts},v1=${hash}`;
}

describe('MembershipsService', () => {
  let service: MembershipsService;
  let membershipRepository: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let planRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let webhookEventRepository: { insert: jest.Mock };
  let mercadoPagoService: { clientFor: jest.Mock };
  let gymsService: {
    getMercadoPagoAccessToken: jest.Mock;
    findByMercadoPagoUserId: jest.Mock;
  };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let subscriptionsApiMock: {
    create: jest.Mock;
    get: jest.Mock;
    update: jest.Mock;
  };
  let paymentsApiMock: { get: jest.Mock };

  const client: AuthenticatedUser = {
    id: 'client-1',
    email: 'client@smartbox.com',
    role: 'CLIENT',
    gymId: 'gym-a',
  };

  beforeEach(async () => {
    membershipRepository = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    planRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn() };
    webhookEventRepository = { insert: jest.fn().mockResolvedValue(undefined) };
    subscriptionsApiMock = {
      create: jest
        .fn()
        .mockResolvedValue({ init_point: 'https://mercadopago.com/xyz' }),
      get: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    paymentsApiMock = { get: jest.fn() };
    mercadoPagoService = {
      clientFor: jest.fn().mockReturnValue({
        subscriptions: subscriptionsApiMock,
        payments: paymentsApiMock,
      }),
    };
    gymsService = {
      getMercadoPagoAccessToken: jest.fn().mockResolvedValue('gym-a-token'),
      findByMercadoPagoUserId: jest.fn(),
    };
    configService = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
      getOrThrow: jest.fn().mockReturnValue(WEBHOOK_SECRET),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        {
          provide: getRepositoryToken(Membership),
          useValue: membershipRepository,
        },
        { provide: getRepositoryToken(Plan), useValue: planRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(ProcessedWebhookEvent),
          useValue: webhookEventRepository,
        },
        { provide: MercadoPagoService, useValue: mercadoPagoService },
        { provide: GymsService, useValue: gymsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(MembershipsService);
  });

  describe('subscribe', () => {
    it('rechaza si el solicitante no pertenece a ningún gimnasio', async () => {
      await expect(
        service.subscribe({ ...client, gymId: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el gimnasio no tiene plan configurado', async () => {
      planRepository.findOne.mockResolvedValue(null);

      await expect(service.subscribe(client)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza si el socio ya tiene una membresía activa', async () => {
      planRepository.findOne.mockResolvedValue({
        id: 'plan-a',
        mercadoPagoPlanId: 'plan_test',
      });
      membershipRepository.findOne.mockResolvedValue({ id: 'membership-1' });

      await expect(service.subscribe(client)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('propaga el error si el gimnasio no conectó Mercado Pago', async () => {
      planRepository.findOne.mockResolvedValue({
        id: 'plan-a',
        mercadoPagoPlanId: 'plan_test',
      });
      membershipRepository.findOne.mockResolvedValue(null);
      gymsService.getMercadoPagoAccessToken.mockRejectedValue(
        new BadRequestException(
          'Este gimnasio todavía no conectó su cuenta de Mercado Pago.',
        ),
      );

      await expect(service.subscribe(client)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('crea la suscripción en la cuenta del gimnasio y devuelve el init_point', async () => {
      planRepository.findOne.mockResolvedValue({
        id: 'plan-a',
        mercadoPagoPlanId: 'plan_test',
      });
      membershipRepository.findOne.mockResolvedValue(null);

      const result = await service.subscribe(client);

      expect(gymsService.getMercadoPagoAccessToken).toHaveBeenCalledWith(
        'gym-a',
      );
      expect(mercadoPagoService.clientFor).toHaveBeenCalledWith('gym-a-token');
      expect(subscriptionsApiMock.create).toHaveBeenCalledWith({
        body: {
          preapproval_plan_id: 'plan_test',
          payer_email: 'client@smartbox.com',
          external_reference: 'client-1',
          back_url: 'http://localhost:3000/dashboard/membership',
          status: 'pending',
        },
      });
      expect(result).toEqual({ checkoutUrl: 'https://mercadopago.com/xyz' });
    });

    it('lanza BadRequestException si Mercado Pago falla al crear la suscripción', async () => {
      planRepository.findOne.mockResolvedValue({
        id: 'plan-a',
        mercadoPagoPlanId: 'plan_test',
      });
      membershipRepository.findOne.mockResolvedValue(null);
      subscriptionsApiMock.create.mockRejectedValue(
        new Error('mercadopago down'),
      );

      await expect(service.subscribe(client)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('handleWebhook', () => {
    const dataId = 'preapproval-123';
    const requestId = 'req-1';
    const ts = 1700000000000;

    it('rechaza con UnauthorizedException si la firma es inválida', async () => {
      await expect(
        service.handleWebhook(
          { id: 1, type: 'subscription_preapproval', data: { id: dataId } },
          { xSignature: 'ts=123,v1=deadbeef', xRequestId: requestId },
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(webhookEventRepository.insert).not.toHaveBeenCalled();
    });

    it('rechaza si falta el header x-signature', async () => {
      await expect(
        service.handleWebhook(
          { id: 1, type: 'subscription_preapproval', data: { id: dataId } },
          { xRequestId: requestId },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('es idempotente: si el evento ya se procesó, no hace nada más', async () => {
      webhookEventRepository.insert.mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );

      await service.handleWebhook(
        { id: 1, type: 'subscription_preapproval', data: { id: dataId } },
        {
          xSignature: signWebhook(dataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(gymsService.findByMercadoPagoUserId).not.toHaveBeenCalled();
    });

    it('ignora eventos que no son de preapproval ni de payment recurrente (p. ej. topic genérico payment) sin fallar', async () => {
      await service.handleWebhook(
        { id: 1, type: 'payment', data: { id: dataId }, user_id: 999 },
        {
          xSignature: signWebhook(dataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(webhookEventRepository.insert).toHaveBeenCalledWith({
        id: '1',
        type: 'payment',
      });
      expect(gymsService.findByMercadoPagoUserId).not.toHaveBeenCalled();
    });

    it('registra el evento pero no hace nada si no encuentra el gimnasio dueño', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue(null);

      await service.handleWebhook(
        {
          id: 1,
          type: 'subscription_preapproval',
          data: { id: dataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(dataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(gymsService.getMercadoPagoAccessToken).not.toHaveBeenCalled();
    });

    it('crea la Membership cuando el PreApproval está authorized y no existía todavía', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue({ id: 'gym-a' });
      subscriptionsApiMock.get.mockResolvedValue({
        id: dataId,
        status: 'authorized',
        external_reference: 'client-1',
        next_payment_date: '2026-08-17T00:00:00.000Z',
      });
      membershipRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue({
        id: 'client-1',
        gym: { id: 'gym-a' },
      });
      planRepository.findOne.mockResolvedValue({
        id: 'plan-a',
        gymId: 'gym-a',
      });

      await service.handleWebhook(
        {
          id: 1,
          type: 'subscription_preapproval',
          data: { id: dataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(dataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(subscriptionsApiMock.get).toHaveBeenCalledWith({ id: dataId });
      expect(membershipRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'client-1',
          planId: 'plan-a',
          status: 'active',
          mercadoPagoPreapprovalId: dataId,
        }),
      );
    });

    it('actualiza la Membership existente en vez de crear una nueva', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue({ id: 'gym-a' });
      subscriptionsApiMock.get.mockResolvedValue({
        id: dataId,
        status: 'authorized',
        external_reference: 'client-1',
        next_payment_date: '2026-08-17T00:00:00.000Z',
      });
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        currentPeriodEnd: null,
      });

      await service.handleWebhook(
        {
          id: 1,
          type: 'subscription_preapproval',
          data: { id: dataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(dataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(membershipRepository.update).toHaveBeenCalledWith(
        'membership-1',
        expect.objectContaining({ status: 'active' }),
      );
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('cancela la Membership existente cuando el PreApproval queda cancelled', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue({ id: 'gym-a' });
      subscriptionsApiMock.get.mockResolvedValue({
        id: dataId,
        status: 'cancelled',
      });
      membershipRepository.findOne.mockResolvedValue({ id: 'membership-1' });

      await service.handleWebhook(
        {
          id: 1,
          type: 'subscription_preapproval',
          data: { id: dataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(dataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(membershipRepository.update).toHaveBeenCalledWith('membership-1', {
        status: 'cancelled',
      });
    });
  });

  describe('handleWebhook — dunning (subscription_authorized_payment)', () => {
    const paymentDataId = 'payment-987';
    const requestId = 'req-2';
    const ts = 1700000001000;

    it('consulta el Payment (no el PreApproval) y no toca la Membership si ya estaba active y el pago fue aprobado', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue({ id: 'gym-a' });
      paymentsApiMock.get.mockResolvedValue({
        id: paymentDataId,
        status: 'approved',
        external_reference: 'client-1',
      });
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        status: 'active',
      });

      await service.handleWebhook(
        {
          id: 2,
          type: 'subscription_authorized_payment',
          data: { id: paymentDataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(paymentDataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(paymentsApiMock.get).toHaveBeenCalledWith({ id: paymentDataId });
      expect(subscriptionsApiMock.get).not.toHaveBeenCalled();
      expect(membershipRepository.update).not.toHaveBeenCalled();
    });

    it('reactiva una Membership past_due cuando el pago recurrente es aprobado', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue({ id: 'gym-a' });
      paymentsApiMock.get.mockResolvedValue({
        id: paymentDataId,
        status: 'approved',
        external_reference: 'client-1',
      });
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        status: 'past_due',
      });

      await service.handleWebhook(
        {
          id: 2,
          type: 'subscription_authorized_payment',
          data: { id: paymentDataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(paymentDataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(membershipRepository.update).toHaveBeenCalledWith(
        'membership-1',
        { status: 'active' },
      );
    });

    it('marca la Membership como past_due cuando el pago recurrente es rechazado', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue({ id: 'gym-a' });
      paymentsApiMock.get.mockResolvedValue({
        id: paymentDataId,
        status: 'rejected',
        external_reference: 'client-1',
      });
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        status: 'active',
      });

      await service.handleWebhook(
        {
          id: 2,
          type: 'subscription_authorized_payment',
          data: { id: paymentDataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(paymentDataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(membershipRepository.update).toHaveBeenCalledWith(
        'membership-1',
        { status: 'past_due' },
      );
    });

    it('no hace nada si el pago rechazado no tiene una Membership active/past_due correlacionada', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue({ id: 'gym-a' });
      paymentsApiMock.get.mockResolvedValue({
        id: paymentDataId,
        status: 'rejected',
        external_reference: 'client-sin-membresia',
      });
      membershipRepository.findOne.mockResolvedValue(null);

      await service.handleWebhook(
        {
          id: 2,
          type: 'subscription_authorized_payment',
          data: { id: paymentDataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(paymentDataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(membershipRepository.update).not.toHaveBeenCalled();
    });

    it('no hace nada si el pago no trae external_reference', async () => {
      gymsService.findByMercadoPagoUserId.mockResolvedValue({ id: 'gym-a' });
      paymentsApiMock.get.mockResolvedValue({
        id: paymentDataId,
        status: 'rejected',
        external_reference: undefined,
      });

      await service.handleWebhook(
        {
          id: 2,
          type: 'subscription_authorized_payment',
          data: { id: paymentDataId },
          user_id: 999,
        },
        {
          xSignature: signWebhook(paymentDataId, requestId, ts),
          xRequestId: requestId,
        },
      );

      expect(membershipRepository.findOne).not.toHaveBeenCalled();
      expect(membershipRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('requestCancellation', () => {
    it('lanza NotFoundException si la membresía no existe', async () => {
      membershipRepository.findOne.mockResolvedValue(null);

      await expect(
        service.requestCancellation('membership-x', client),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el solicitante no es el dueño ni ADMIN del gym', async () => {
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        userId: 'other-client',
        status: 'active',
        cancelAtPeriodEnd: false,
        plan: { gymId: 'gym-b' },
      });

      await expect(
        service.requestCancellation('membership-1', client),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite al dueño cancelar su propia membresía', async () => {
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        userId: 'client-1',
        status: 'active',
        cancelAtPeriodEnd: false,
        plan: { gymId: 'gym-a' },
      });
      membershipRepository.findOneOrFail.mockResolvedValue({
        id: 'membership-1',
        cancelAtPeriodEnd: true,
      });

      await service.requestCancellation('membership-1', client);

      expect(membershipRepository.update).toHaveBeenCalledWith('membership-1', {
        cancelAtPeriodEnd: true,
      });
    });

    it('permite a un ADMIN del mismo gym cancelar la membresía de un socio', async () => {
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        userId: 'other-client',
        status: 'active',
        cancelAtPeriodEnd: false,
        plan: { gymId: 'gym-a' },
      });
      membershipRepository.findOneOrFail.mockResolvedValue({
        id: 'membership-1',
        cancelAtPeriodEnd: true,
      });

      const admin: AuthenticatedUser = {
        id: 'admin-1',
        email: 'admin@smartbox.com',
        role: 'ADMIN',
        gymId: 'gym-a',
      };

      await service.requestCancellation('membership-1', admin);

      expect(membershipRepository.update).toHaveBeenCalledWith('membership-1', {
        cancelAtPeriodEnd: true,
      });
    });

    it('rechaza si la membresía ya no está active', async () => {
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        userId: 'client-1',
        status: 'cancelled',
        cancelAtPeriodEnd: false,
        plan: { gymId: 'gym-a' },
      });

      await expect(
        service.requestCancellation('membership-1', client),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si ya hay una cancelación pendiente', async () => {
      membershipRepository.findOne.mockResolvedValue({
        id: 'membership-1',
        userId: 'client-1',
        status: 'active',
        cancelAtPeriodEnd: true,
        plan: { gymId: 'gym-a' },
      });

      await expect(
        service.requestCancellation('membership-1', client),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('processScheduledCancellations', () => {
    it('cancela en Mercado Pago y localmente las membresías vencidas con cancelación pendiente', async () => {
      membershipRepository.find.mockResolvedValue([
        {
          id: 'membership-1',
          mercadoPagoPreapprovalId: 'preapproval-1',
          plan: { gymId: 'gym-a' },
        },
      ]);

      await service.processScheduledCancellations();

      expect(gymsService.getMercadoPagoAccessToken).toHaveBeenCalledWith(
        'gym-a',
      );
      expect(subscriptionsApiMock.update).toHaveBeenCalledWith({
        id: 'preapproval-1',
        body: { status: 'cancelled' },
      });
      expect(membershipRepository.update).toHaveBeenCalledWith('membership-1', {
        status: 'cancelled',
      });
    });

    it('cancela localmente sin llamar a Mercado Pago si no hay preapproval asociado', async () => {
      membershipRepository.find.mockResolvedValue([
        {
          id: 'membership-1',
          mercadoPagoPreapprovalId: null,
          plan: { gymId: 'gym-a' },
        },
      ]);

      await service.processScheduledCancellations();

      expect(subscriptionsApiMock.update).not.toHaveBeenCalled();
      expect(membershipRepository.update).toHaveBeenCalledWith('membership-1', {
        status: 'cancelled',
      });
    });

    it('deja cancelAtPeriodEnd sin tocar si falla la cancelación remota, para reintentar', async () => {
      membershipRepository.find.mockResolvedValue([
        {
          id: 'membership-1',
          mercadoPagoPreapprovalId: 'preapproval-1',
          plan: { gymId: 'gym-a' },
        },
      ]);
      subscriptionsApiMock.update.mockRejectedValue(new Error('mp down'));

      await service.processScheduledCancellations();

      expect(membershipRepository.update).not.toHaveBeenCalled();
    });
  });
});
