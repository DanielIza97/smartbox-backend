import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { GymsService } from './gyms.service';
import { Gym } from './entities/gym.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { MercadoPagoService } from '../../common/mercadopago/mercadopago.service';

describe('GymsService', () => {
  let service: GymsService;
  let gymRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let membershipRepository: { createQueryBuilder: jest.Mock };
  let membershipQueryBuilder: {
    innerJoin: jest.Mock;
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    groupBy: jest.Mock;
    getRawMany: jest.Mock;
  };
  let mercadoPagoService: {
    verifyAccessToken: jest.Mock;
  };
  let qb: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(async () => {
    qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    gymRepository = {
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    membershipQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    membershipRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(membershipQueryBuilder),
    };
    mercadoPagoService = {
      verifyAccessToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GymsService,
        { provide: getRepositoryToken(Gym), useValue: gymRepository },
        {
          provide: getRepositoryToken(Membership),
          useValue: membershipRepository,
        },
        { provide: MercadoPagoService, useValue: mercadoPagoService },
      ],
    }).compile();

    service = module.get(GymsService);
  });

  describe('findAll', () => {
    it('devuelve un array vacío sin consultar memberships si no hay gimnasios', async () => {
      gymRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(membershipRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('agrega activeMembersCount por gimnasio, 0 si no aparece en el conteo', async () => {
      gymRepository.find.mockResolvedValue([
        { id: 'gym-a', name: 'Gym A' },
        { id: 'gym-b', name: 'Gym B' },
      ]);
      membershipQueryBuilder.getRawMany.mockResolvedValue([
        { gymId: 'gym-a', count: '3' },
      ]);

      const result = await service.findAll();

      expect(membershipQueryBuilder.where).toHaveBeenCalledWith(
        'membership.status = :status',
        { status: 'active' },
      );
      expect(membershipQueryBuilder.groupBy).toHaveBeenCalledWith(
        'plan.gym_id',
      );
      expect(result).toEqual([
        { id: 'gym-a', name: 'Gym A', activeMembersCount: 3 },
        { id: 'gym-b', name: 'Gym B', activeMembersCount: 0 },
      ]);
    });
  });

  describe('connectMercadoPago', () => {
    it('lanza NotFoundException si el gimnasio no existe', async () => {
      gymRepository.findOne.mockResolvedValue(null);

      await expect(
        service.connectMercadoPago('gym-x', 'token-abc', 'secret-abc'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException y no guarda nada si el token es inválido', async () => {
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });
      mercadoPagoService.verifyAccessToken.mockRejectedValue(
        new Error('invalid token'),
      );

      await expect(
        service.connectMercadoPago('gym-a', 'bad-token', 'secret-abc'),
      ).rejects.toThrow(BadRequestException);
      expect(gymRepository.update).not.toHaveBeenCalled();
    });

    it('valida el token y guarda userId/accessToken/webhookSecret', async () => {
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });
      mercadoPagoService.verifyAccessToken.mockResolvedValue({
        userId: '12345',
        email: 'gym@example.com',
      });

      await service.connectMercadoPago('gym-a', 'token-abc', 'secret-abc');

      expect(mercadoPagoService.verifyAccessToken).toHaveBeenCalledWith(
        'token-abc',
      );
      expect(gymRepository.update).toHaveBeenCalledWith('gym-a', {
        mercadoPagoUserId: '12345',
        mercadoPagoAccessToken: 'token-abc',
        mercadoPagoWebhookSecret: 'secret-abc',
      });
    });
  });

  describe('getMercadoPagoAccessToken', () => {
    it('lanza BadRequestException si el gimnasio no conectó Mercado Pago', async () => {
      qb.getOne.mockResolvedValue({
        id: 'gym-a',
        mercadoPagoAccessToken: null,
      });

      await expect(service.getMercadoPagoAccessToken('gym-a')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('devuelve el access token cuando el gimnasio está conectado', async () => {
      qb.getOne.mockResolvedValue({
        id: 'gym-a',
        mercadoPagoAccessToken: 'access-xyz',
      });

      const token = await service.getMercadoPagoAccessToken('gym-a');
      expect(token).toBe('access-xyz');
    });
  });

  describe('getMercadoPagoWebhookSecret', () => {
    it('lanza BadRequestException si el gimnasio no tiene secreto configurado', async () => {
      qb.getOne.mockResolvedValue({
        id: 'gym-a',
        mercadoPagoWebhookSecret: null,
      });

      await expect(
        service.getMercadoPagoWebhookSecret('gym-a'),
      ).rejects.toThrow(BadRequestException);
    });

    it('devuelve el secreto cuando está configurado', async () => {
      qb.getOne.mockResolvedValue({
        id: 'gym-a',
        mercadoPagoWebhookSecret: 'secret-xyz',
      });

      const secret = await service.getMercadoPagoWebhookSecret('gym-a');
      expect(secret).toBe('secret-xyz');
    });
  });
});
