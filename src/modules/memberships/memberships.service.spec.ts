import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { MembershipsService } from './memberships.service';
import { Membership } from './entities/membership.entity';
import { Plan } from '../plans/entities/plan.entity';
import { MercadoPagoService } from '../../common/mercadopago/mercadopago.service';
import { GymsService } from '../gyms/gyms.service';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('MembershipsService', () => {
  let service: MembershipsService;
  let membershipRepository: { findOne: jest.Mock };
  let planRepository: { findOne: jest.Mock };
  let mercadoPagoService: { clientFor: jest.Mock };
  let gymsService: { getMercadoPagoAccessToken: jest.Mock };
  let configService: { get: jest.Mock };
  let subscriptionsApiMock: { create: jest.Mock };

  const client: AuthenticatedUser = {
    id: 'client-1',
    email: 'client@smartbox.com',
    role: 'CLIENT',
    gymId: 'gym-a',
  };

  beforeEach(async () => {
    membershipRepository = { findOne: jest.fn() };
    planRepository = { findOne: jest.fn() };
    subscriptionsApiMock = {
      create: jest
        .fn()
        .mockResolvedValue({ init_point: 'https://mercadopago.com/xyz' }),
    };
    mercadoPagoService = {
      clientFor: jest
        .fn()
        .mockReturnValue({ subscriptions: subscriptionsApiMock }),
    };
    gymsService = {
      getMercadoPagoAccessToken: jest.fn().mockResolvedValue('gym-a-token'),
    };
    configService = { get: jest.fn().mockReturnValue('http://localhost:3000') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        {
          provide: getRepositoryToken(Membership),
          useValue: membershipRepository,
        },
        { provide: getRepositoryToken(Plan), useValue: planRepository },
        { provide: MercadoPagoService, useValue: mercadoPagoService },
        { provide: GymsService, useValue: gymsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(MembershipsService);
  });

  it('rechaza si el solicitante no pertenece a ningún gimnasio', async () => {
    await expect(service.subscribe({ ...client, gymId: null })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza NotFoundException si el gimnasio no tiene plan configurado', async () => {
    planRepository.findOne.mockResolvedValue(null);

    await expect(service.subscribe(client)).rejects.toThrow(NotFoundException);
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

    expect(gymsService.getMercadoPagoAccessToken).toHaveBeenCalledWith('gym-a');
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
