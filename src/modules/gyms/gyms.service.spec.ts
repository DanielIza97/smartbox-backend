import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { GymsService } from './gyms.service';
import { Gym } from './entities/gym.entity';
import { MercadoPagoService } from '../../common/mercadopago/mercadopago.service';
import { TokenService } from '../../common/token/token.service';

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
  let mercadoPagoService: {
    getAuthorizationUrl: jest.Mock;
    exchangeCodeForTokens: jest.Mock;
  };
  let tokenService: { generate: jest.Mock; isExpired: jest.Mock };
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
    mercadoPagoService = {
      getAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://auth.mercadopago.com/xyz'),
      exchangeCodeForTokens: jest.fn(),
    };
    tokenService = {
      generate: jest
        .fn()
        .mockReturnValue({ token: 'state-token', expiresAt: new Date() }),
      isExpired: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GymsService,
        { provide: getRepositoryToken(Gym), useValue: gymRepository },
        { provide: MercadoPagoService, useValue: mercadoPagoService },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    service = module.get(GymsService);
  });

  describe('startMercadoPagoConnect', () => {
    it('lanza NotFoundException si el gimnasio no existe', async () => {
      gymRepository.findOne.mockResolvedValue(null);

      await expect(service.startMercadoPagoConnect('gym-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('guarda un state nuevo y devuelve la authorizationUrl', async () => {
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });

      const result = await service.startMercadoPagoConnect('gym-a');

      const [gymId, update] = gymRepository.update.mock.calls[0] as [
        string,
        { mercadoPagoOauthState: string; mercadoPagoOauthStateExpiresAt: Date },
      ];
      expect(gymId).toBe('gym-a');
      expect(update.mercadoPagoOauthState).toBe('state-token');
      expect(update.mercadoPagoOauthStateExpiresAt).toBeInstanceOf(Date);
      expect(mercadoPagoService.getAuthorizationUrl).toHaveBeenCalledWith(
        'state-token',
      );
      expect(result).toEqual({
        authorizationUrl: 'https://auth.mercadopago.com/xyz',
      });
    });
  });

  describe('completeMercadoPagoConnect', () => {
    it('rechaza si no encuentra un gym con ese state', async () => {
      qb.getOne.mockResolvedValue(null);

      await expect(
        service.completeMercadoPagoConnect('code', 'bad-state'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el state ya expiró', async () => {
      qb.getOne.mockResolvedValue({
        id: 'gym-a',
        mercadoPagoOauthStateExpiresAt: new Date('2020-01-01'),
      });
      tokenService.isExpired.mockReturnValue(true);

      await expect(
        service.completeMercadoPagoConnect('code', 'state-token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('intercambia el code y guarda los tokens del gimnasio', async () => {
      qb.getOne.mockResolvedValue({
        id: 'gym-a',
        mercadoPagoOauthStateExpiresAt: new Date(Date.now() + 60_000),
      });
      mercadoPagoService.exchangeCodeForTokens.mockResolvedValue({
        access_token: 'access-xyz',
        refresh_token: 'refresh-xyz',
        user_id: 12345,
        expires_in: 3600,
      });
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });

      await service.completeMercadoPagoConnect('the-code', 'state-token');

      expect(mercadoPagoService.exchangeCodeForTokens).toHaveBeenCalledWith(
        'the-code',
      );
      expect(gymRepository.update).toHaveBeenCalledWith(
        'gym-a',
        expect.objectContaining({
          mercadoPagoUserId: '12345',
          mercadoPagoAccessToken: 'access-xyz',
          mercadoPagoRefreshToken: 'refresh-xyz',
          mercadoPagoOauthState: null,
          mercadoPagoOauthStateExpiresAt: null,
        }),
      );
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
});
