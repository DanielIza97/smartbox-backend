process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-e2e';

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import { ReservationsController } from '../src/modules/reservations/reservations.controller';
import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

describe('Guards en /reservations (e2e, sin base de datos)', () => {
  let app: INestApplication<App>;
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });

  const reservationsServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    cancel: jest.fn(),
  };

  const tokenFor = (role: string, gymId: string | null) =>
    jwtService.sign({ sub: 'u1', email: 'user@smartbox.com', role, gymId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [ReservationsController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: ReservationsService, useValue: reservationsServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    reservationsServiceMock.create.mockReset();
    reservationsServiceMock.findAll.mockReset();
    reservationsServiceMock.cancel.mockReset();
  });

  describe('POST /reservations', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .post('/reservations')
        .send({})
        .expect(401);
    });

    it('devuelve 403 para roles distintos de CLIENT', () => {
      return request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
        .send({ classId: 'class-1', startAt: '2026-07-13T09:00:00.000Z' })
        .expect(403);
    });

    it('devuelve 201 con la reserva para un CLIENT autenticado', async () => {
      reservationsServiceMock.create.mockResolvedValue({
        id: 'reservation-1',
        status: 'confirmed',
      });

      const res = await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .send({ classId: 'class-1', startAt: '2026-07-13T09:00:00.000Z' })
        .expect(201);

      expect(res.body).toEqual({ id: 'reservation-1', status: 'confirmed' });
    });

    it('devuelve 400 si el service rechaza la reserva (p. ej. sin cupo)', async () => {
      reservationsServiceMock.create.mockRejectedValue(
        new BadRequestException('No hay cupo disponible para ese horario.'),
      );

      await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .send({ classId: 'class-1', startAt: '2026-07-13T09:00:00.000Z' })
        .expect(400);
    });
  });

  describe('GET /reservations', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/reservations').expect(401);
    });

    it('devuelve 200 para cualquier rol autenticado', async () => {
      reservationsServiceMock.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/reservations')
        .set('Authorization', `Bearer ${tokenFor('STAFF', 'gym-a')}`)
        .expect(200);
    });
  });

  describe('POST /reservations/:id/cancel', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .post('/reservations/reservation-1/cancel')
        .expect(401);
    });

    it('devuelve 403 para roles distintos de CLIENT/ADMIN/SUPER_ADMIN', () => {
      return request(app.getHttpServer())
        .post('/reservations/reservation-1/cancel')
        .set('Authorization', `Bearer ${tokenFor('STAFF', 'gym-a')}`)
        .expect(403);
    });

    it('devuelve 200 para un CLIENT autenticado', async () => {
      reservationsServiceMock.cancel.mockResolvedValue({
        id: 'reservation-1',
        status: 'cancelled',
      });

      const res = await request(app.getHttpServer())
        .post('/reservations/reservation-1/cancel')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .expect(200);

      expect(res.body).toEqual({ id: 'reservation-1', status: 'cancelled' });
    });
  });
});
