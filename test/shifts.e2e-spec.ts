process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-e2e';

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import { ShiftsController } from '../src/modules/shifts/shifts.controller';
import { ShiftsService } from '../src/modules/shifts/shifts.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

describe('Guards y aislamiento en /shifts (e2e, sin base de datos)', () => {
  let app: INestApplication<App>;
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });

  const shiftsServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  const tokenFor = (role: string, gymId: string | null) =>
    jwtService.sign({ sub: 'u1', email: 'user@smartbox.com', role, gymId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [ShiftsController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: ShiftsService, useValue: shiftsServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    shiftsServiceMock.create.mockReset();
    shiftsServiceMock.findAll.mockReset();
    shiftsServiceMock.findOne.mockReset();
  });

  describe('POST /shifts', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).post('/shifts').send({}).expect(401);
    });

    it('devuelve 403 con rol insuficiente (STAFF)', () => {
      return request(app.getHttpServer())
        .post('/shifts')
        .set('Authorization', `Bearer ${tokenFor('STAFF', 'gym-a')}`)
        .send({
          staffId: 'staff-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
        })
        .expect(403);
    });

    it('devuelve 201 con rol ADMIN', async () => {
      shiftsServiceMock.create.mockResolvedValue({ id: 'shift-1' });

      await request(app.getHttpServer())
        .post('/shifts')
        .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
        .send({
          staffId: 'staff-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
        })
        .expect(201);
    });
  });

  describe('GET /shifts/:id', () => {
    it('devuelve 403 (no 404) si el turno es de otro gimnasio', async () => {
      shiftsServiceMock.findOne.mockRejectedValue(
        new ForbiddenException('No tenés acceso a este turno.'),
      );

      await request(app.getHttpServer())
        .get('/shifts/shift-de-otro-gym')
        .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
        .expect(403);
    });

    it('devuelve 200 si el turno pertenece al propio gimnasio', async () => {
      shiftsServiceMock.findOne.mockResolvedValue({ id: 'shift-a' });

      await request(app.getHttpServer())
        .get('/shifts/shift-a')
        .set('Authorization', `Bearer ${tokenFor('STAFF', 'gym-a')}`)
        .expect(200);
    });
  });

  describe('GET /shifts', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/shifts').expect(401);
    });

    it('un STAFF autenticado puede listar', async () => {
      shiftsServiceMock.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/shifts')
        .set('Authorization', `Bearer ${tokenFor('STAFF', 'gym-a')}`)
        .expect(200);
    });
  });
});
