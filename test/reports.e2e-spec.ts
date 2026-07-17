process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-e2e';

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import { ReportsController } from '../src/modules/reports/reports.controller';
import { ReportsService } from '../src/modules/reports/reports.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

describe('Guards en /reports (e2e, sin base de datos)', () => {
  let app: INestApplication<App>;
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });

  const reportsServiceMock = {
    getOccupancy: jest.fn(),
    getRevenue: jest.fn(),
  };

  const tokenFor = (role: string, gymId: string | null) =>
    jwtService.sign({ sub: 'u1', email: 'user@smartbox.com', role, gymId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [ReportsController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: ReportsService, useValue: reportsServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    reportsServiceMock.getOccupancy.mockReset();
    reportsServiceMock.getRevenue.mockReset();
  });

  describe('GET /reports/occupancy', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/reports/occupancy').expect(401);
    });

    it('devuelve 403 para CLIENT', () => {
      return request(app.getHttpServer())
        .get('/reports/occupancy')
        .set('Authorization', `Bearer ${tokenFor('CLIENT', 'gym-a')}`)
        .expect(403);
    });

    it('devuelve 200 para STAFF', async () => {
      reportsServiceMock.getOccupancy.mockResolvedValue({
        slots: [],
        averageOccupancyRate: 0,
      });

      await request(app.getHttpServer())
        .get('/reports/occupancy')
        .set('Authorization', `Bearer ${tokenFor('STAFF', 'gym-a')}`)
        .expect(200);
    });
  });

  describe('GET /reports/revenue', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/reports/revenue').expect(401);
    });

    it('devuelve 403 para STAFF (solo ADMIN)', () => {
      return request(app.getHttpServer())
        .get('/reports/revenue')
        .set('Authorization', `Bearer ${tokenFor('STAFF', 'gym-a')}`)
        .expect(403);
    });

    it('devuelve 400 si el service rechaza (SUPER_ADMIN sin gymId)', async () => {
      reportsServiceMock.getRevenue.mockRejectedValue(
        new BadRequestException('gymId es obligatorio para SUPER_ADMIN.'),
      );

      await request(app.getHttpServer())
        .get('/reports/revenue')
        .set('Authorization', `Bearer ${tokenFor('SUPER_ADMIN', null)}`)
        .expect(400);
    });

    it('devuelve 200 para ADMIN', async () => {
      reportsServiceMock.getRevenue.mockResolvedValue({
        days: [],
        totalCents: 0,
        activeMembersCount: 0,
      });

      await request(app.getHttpServer())
        .get('/reports/revenue')
        .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
        .expect(200);
    });
  });
});
