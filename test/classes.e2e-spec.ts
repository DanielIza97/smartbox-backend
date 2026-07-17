process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-e2e';

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import { ClassesController } from '../src/modules/classes/classes.controller';
import { ClassesService } from '../src/modules/classes/classes.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

describe('Guards y aislamiento en /classes (e2e, sin base de datos)', () => {
  let app: INestApplication<App>;
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });

  const classesServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getAvailability: jest.fn(),
  };

  const tokenFor = (role: string, gymId: string | null) =>
    jwtService.sign({ sub: 'u1', email: 'user@smartbox.com', role, gymId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [ClassesController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: ClassesService, useValue: classesServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    classesServiceMock.create.mockReset();
    classesServiceMock.findAll.mockReset();
    classesServiceMock.findOne.mockReset();
    classesServiceMock.getAvailability.mockReset();
  });

  describe('POST /classes', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).post('/classes').send({}).expect(401);
    });

    it('devuelve 403 con rol insuficiente (CLIENT)', () => {
      return request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .send({
          name: 'Yoga',
          capacity: 10,
          dayOfWeek: 1,
          startTime: '09:00',
          durationMinutes: 60,
        })
        .expect(403);
    });

    it('devuelve 201 con rol ADMIN y fuerza el gymId del token', async () => {
      classesServiceMock.create.mockResolvedValue({ id: 'class-1' });

      await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
        .send({
          name: 'Yoga',
          capacity: 10,
          dayOfWeek: 1,
          startTime: '09:00',
          durationMinutes: 60,
          gymId: 'gym-b',
        })
        .expect(201);

      expect(classesServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ gymId: 'gym-a' }),
      );
    });
  });

  describe('GET /classes/:id', () => {
    it('devuelve 403 (no 404) si la clase es de otro gimnasio', async () => {
      classesServiceMock.findOne.mockRejectedValue(
        new ForbiddenException('No tenés acceso a esta clase.'),
      );

      await request(app.getHttpServer())
        .get('/classes/class-de-otro-gym')
        .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
        .expect(403);
    });

    it('devuelve 200 si la clase pertenece al propio gimnasio', async () => {
      classesServiceMock.findOne.mockResolvedValue({
        id: 'class-a',
        gymId: 'gym-a',
      });

      await request(app.getHttpServer())
        .get('/classes/class-a')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .expect(200);
    });
  });

  describe('GET /classes', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/classes').expect(401);
    });

    it('un CLIENT autenticado puede listar (ve solo su gimnasio)', async () => {
      classesServiceMock.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/classes')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .expect(200);

      expect(classesServiceMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'CLIENT', gymId: 'gym-a' }),
      );
    });
  });

  describe('GET /classes/:id/availability', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .get('/classes/class-a/availability')
        .expect(401);
    });

    it('devuelve 200 con los turnos disponibles para un CLIENT autenticado', async () => {
      classesServiceMock.getAvailability.mockResolvedValue([
        { startAt: '2026-07-13T09:00:00.000Z', capacity: 10, available: 4 },
      ]);

      const res = await request(app.getHttpServer())
        .get('/classes/class-a/availability')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .expect(200);

      expect(res.body).toEqual([
        { startAt: '2026-07-13T09:00:00.000Z', capacity: 10, available: 4 },
      ]);
    });
  });
});
