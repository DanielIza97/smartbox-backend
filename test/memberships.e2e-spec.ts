process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-e2e';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import { MembershipsController } from '../src/modules/memberships/memberships.controller';
import { MembershipsService } from '../src/modules/memberships/memberships.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

describe('Guards en POST /memberships/subscribe (e2e, sin base de datos ni Mercado Pago)', () => {
  let app: INestApplication<App>;
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });

  const membershipsServiceMock = {
    subscribe: jest.fn().mockResolvedValue({
      checkoutUrl: 'https://mercadopago.com/checkout/xyz',
    }),
    handleWebhook: jest.fn().mockResolvedValue(undefined),
  };

  const tokenFor = (role: string, gymId: string | null) =>
    jwtService.sign({ sub: 'u1', email: 'user@smartbox.com', role, gymId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [MembershipsController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: MembershipsService, useValue: membershipsServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('devuelve 401 sin token', () => {
    return request(app.getHttpServer())
      .post('/memberships/subscribe')
      .expect(401);
  });

  it('devuelve 403 para roles distintos de CLIENT', () => {
    return request(app.getHttpServer())
      .post('/memberships/subscribe')
      .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
      .expect(403);
  });

  it('devuelve 200 con la checkoutUrl para un CLIENT autenticado', async () => {
    const res = await request(app.getHttpServer())
      .post('/memberships/subscribe')
      .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
      .expect(200);

    expect(res.body).toEqual({
      checkoutUrl: 'https://mercadopago.com/checkout/xyz',
    });
  });
});

describe('POST /memberships/webhook/mercadopago (e2e, sin base de datos ni Mercado Pago)', () => {
  let app: INestApplication<App>;

  const membershipsServiceMock = {
    subscribe: jest.fn(),
    handleWebhook: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [MembershipsController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: MembershipsService, useValue: membershipsServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    membershipsServiceMock.handleWebhook.mockClear();
  });

  it('es público (200 sin Authorization) y reenvía body/query/headers al service', async () => {
    await request(app.getHttpServer())
      .post('/memberships/webhook/mercadopago?data.id=preapproval-1')
      .set('x-signature', 'ts=123,v1=abc')
      .set('x-request-id', 'req-1')
      .send({ id: 42, type: 'subscription_preapproval', user_id: 999 })
      .expect(200);

    expect(membershipsServiceMock.handleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        type: 'subscription_preapproval',
        user_id: 999,
        data: { id: 'preapproval-1' },
      }),
      { xSignature: 'ts=123,v1=abc', xRequestId: 'req-1' },
    );
  });

  it('devuelve 401 si el service rechaza la firma', async () => {
    membershipsServiceMock.handleWebhook.mockRejectedValueOnce(
      new UnauthorizedException('Firma de webhook inválida.'),
    );

    await request(app.getHttpServer())
      .post('/memberships/webhook/mercadopago?data.id=preapproval-1')
      .send({ id: 42, type: 'subscription_preapproval' })
      .expect(401);
  });
});
