process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-e2e';

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import { PlansController } from '../src/modules/plans/plans.controller';
import { PlansService } from '../src/modules/plans/plans.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

describe('Guards y aislamiento en /plans (e2e, sin base de datos)', () => {
  let app: INestApplication<App>;
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });

  const plansServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  const tokenFor = (role: string, gymId: string | null) =>
    jwtService.sign({ sub: 'u1', email: 'user@smartbox.com', role, gymId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [PlansController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: PlansService, useValue: plansServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    plansServiceMock.create.mockReset();
    plansServiceMock.findAll.mockReset();
    plansServiceMock.findOne.mockReset();
  });

  describe('POST /plans', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).post('/plans').send({}).expect(401);
    });

    it('devuelve 403 con rol insuficiente (CLIENT)', () => {
      return request(app.getHttpServer())
        .post('/plans')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .send({ name: 'Plan mensual', priceCents: 4999 })
        .expect(403);
    });

    it('devuelve 201 con rol ADMIN y fuerza el gymId del token', async () => {
      plansServiceMock.create.mockResolvedValue({ id: 'plan-1' });

      await request(app.getHttpServer())
        .post('/plans')
        .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
        .send({ name: 'Plan mensual', priceCents: 4999, gymId: 'gym-b' })
        .expect(201);

      expect(plansServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ gymId: 'gym-a' }),
      );
    });
  });

  describe('GET /plans/:id', () => {
    it('devuelve 403 (no 404) si el plan es de otro gimnasio', async () => {
      plansServiceMock.findOne.mockRejectedValue(
        new ForbiddenException('No tenés acceso a este plan.'),
      );

      await request(app.getHttpServer())
        .get('/plans/plan-de-otro-gym')
        .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
        .expect(403);
    });

    it('devuelve 200 si el plan pertenece al propio gimnasio', async () => {
      plansServiceMock.findOne.mockResolvedValue({
        id: 'plan-a',
        gymId: 'gym-a',
      });

      await request(app.getHttpServer())
        .get('/plans/plan-a')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .expect(200);
    });
  });

  describe('GET /plans', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/plans').expect(401);
    });

    it('un CLIENT autenticado puede listar (ve solo su gimnasio)', async () => {
      plansServiceMock.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/plans')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .expect(200);

      expect(plansServiceMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'CLIENT', gymId: 'gym-a' }),
      );
    });
  });
});
