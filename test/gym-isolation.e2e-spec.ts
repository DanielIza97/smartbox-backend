process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-e2e';

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

// Cubre el criterio de aceptación de Epic 1: un ADMIN de un gimnasio no debe
// poder ver ni inferir recursos de otro gimnasio — 403, no 404 (CLAUDE.md).
describe('Aislamiento multi-tenant en /users (e2e, sin base de datos)', () => {
  let app: INestApplication<App>;
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });

  const usersServiceMock = {
    findOneScoped: jest.fn(),
    findAll: jest.fn(),
  };

  const tokenFor = (role: string, gymId: string | null) =>
    jwtService.sign({
      sub: 'requester-1',
      email: 'admin@smartbox.com',
      role,
      gymId,
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [UsersController],
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: UsersService, useValue: usersServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    usersServiceMock.findOneScoped.mockReset();
    usersServiceMock.findAll.mockReset();
  });

  it('un ADMIN del gimnasio A recibe 403 (no 404) al pedir un usuario del gimnasio B', async () => {
    usersServiceMock.findOneScoped.mockRejectedValue(
      new ForbiddenException('No tenés acceso a este usuario.'),
    );

    await request(app.getHttpServer())
      .get('/users/user-de-otro-gym')
      .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
      .expect(403);

    expect(usersServiceMock.findOneScoped).toHaveBeenCalledWith(
      'user-de-otro-gym',
      expect.objectContaining({ role: 'ADMIN', gymId: 'gym-a' }),
    );
  });

  it('un ADMIN del gimnasio A puede ver un usuario de su propio gimnasio', async () => {
    usersServiceMock.findOneScoped.mockResolvedValue({
      id: 'user-a',
      gym: { id: 'gym-a' },
    });

    await request(app.getHttpServer())
      .get('/users/user-a')
      .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
      .expect(200);
  });

  it('un SUPER_ADMIN puede ver usuarios de cualquier gimnasio', async () => {
    usersServiceMock.findOneScoped.mockResolvedValue({
      id: 'user-b',
      gym: { id: 'gym-b' },
    });

    await request(app.getHttpServer())
      .get('/users/user-b')
      .set('Authorization', `Bearer ${tokenFor('SUPER_ADMIN', null)}`)
      .expect(200);
  });

  it('el listado de usuarios se pasa siempre con el requester para que el service lo scopee', async () => {
    usersServiceMock.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${tokenFor('ADMIN', 'gym-a')}`)
      .expect(200);

    expect(usersServiceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN', gymId: 'gym-a' }),
    );
  });
});
