process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-e2e';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { AdminController } from '../src/modules/admin/admin.controller';
import { AdminService } from '../src/modules/admin/admin.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

describe('Rutas protegidas (e2e, sin base de datos)', () => {
  let app: INestApplication<App>;
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });

  const usersServiceMock = {
    create: jest.fn().mockResolvedValue({ id: 'u1' }),
    update: jest.fn().mockResolvedValue({ id: 'u1' }),
    remove: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'u1' }),
  };

  const adminServiceMock = {
    getDashboardSummary: jest
      .fn()
      .mockResolvedValue({ totalUsers: 0, totalRoles: 0, usersByRole: {} }),
  };

  const tokenFor = (role: string) =>
    jwtService.sign({ sub: 'u1', email: 'user@smartbox.com', role });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [UsersController, AdminController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: AdminService, useValue: adminServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /users', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/users').expect(401);
    });

    it('devuelve 403 con token válido pero rol insuficiente (CLIENT)', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokenFor('CLIENT')}`)
        .expect(403);
    });

    it('devuelve 200 con token válido y rol ADMIN', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
        .expect(200);
    });
  });

  describe('POST /users', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).post('/users').send({}).expect(401);
    });
  });

  describe('PUT /users/:id', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer())
        .put('/users/some-id')
        .send({ name: 'x' })
        .expect(401);
    });
  });

  describe('DELETE /users/:id', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).delete('/users/some-id').expect(401);
    });

    it('devuelve 403 con token válido pero rol insuficiente (CLIENT)', () => {
      return request(app.getHttpServer())
        .delete('/users/some-id')
        .set('Authorization', `Bearer ${tokenFor('CLIENT')}`)
        .expect(403);
    });

    it('devuelve 204 con token válido y rol ADMIN', () => {
      return request(app.getHttpServer())
        .delete('/users/some-id')
        .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
        .expect(204);
    });
  });

  describe('GET /admin', () => {
    it('devuelve 401 sin token', () => {
      return request(app.getHttpServer()).get('/admin').expect(401);
    });

    it('devuelve 403 con token válido pero rol insuficiente (CLIENT)', () => {
      return request(app.getHttpServer())
        .get('/admin')
        .set('Authorization', `Bearer ${tokenFor('CLIENT')}`)
        .expect(403);
    });

    it('devuelve 200 con token válido y rol ADMIN', () => {
      return request(app.getHttpServer())
        .get('/admin')
        .set('Authorization', `Bearer ${tokenFor('ADMIN')}`)
        .expect(200);
    });

    it('SUPER_ADMIN siempre pasa aunque el endpoint pida ADMIN', () => {
      return request(app.getHttpServer())
        .get('/admin')
        .set('Authorization', `Bearer ${tokenFor('SUPER_ADMIN')}`)
        .expect(200);
    });
  });
});
