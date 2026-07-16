import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { TokenService } from '../../common/token/token.service';
import { Role } from '../roles/entities/role.entity';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    create: jest.Mock;
    updateResetToken: jest.Mock;
    findByResetToken: jest.Mock;
    updatePasswordAndClearToken: jest.Mock;
    confirmEmailChange: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let roleRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateResetToken: jest.fn(),
      findByResetToken: jest.fn(),
      updatePasswordAndClearToken: jest.fn(),
      confirmEmailChange: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    };
    roleRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: MailService,
          useValue: {
            sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        TokenService,
        { provide: getRepositoryToken(Role), useValue: roleRepository },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('login', () => {
    it('devuelve un access_token y los datos del usuario con credenciales válidas', async () => {
      const hashedPassword = await bcrypt.hash('correcta123', 10);
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'demo@smartbox.com',
        name: 'Demo',
        password: hashedPassword,
        role: { name: 'CLIENT' },
        gym: { id: 'gym-1' },
      });

      const result = await authService.login(
        'demo@smartbox.com',
        'correcta123',
      );

      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'demo@smartbox.com',
        name: 'Demo',
        role: 'CLIENT',
        gymId: 'gym-1',
      });
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login('no-existe@smartbox.com', 'cualquiera'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      const hashedPassword = await bcrypt.hash('correcta123', 10);
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'demo@smartbox.com',
        password: hashedPassword,
        role: { name: 'CLIENT' },
      });

      await expect(
        authService.login('demo@smartbox.com', 'incorrecta'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('crea el usuario resolviendo el rol CLIENT por nombre, no por un UUID fijo', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      roleRepository.findOne.mockResolvedValue({
        id: 'role-client-uuid',
        name: 'CLIENT',
      });
      usersService.create.mockResolvedValue({
        id: 'user-2',
        name: 'Nuevo',
        email: 'nuevo@smartbox.com',
        status: 'active',
      });

      await authService.register({
        name: 'Nuevo',
        email: 'nuevo@smartbox.com',
        password: 'contraseña123',
        gymId: 'gym-1',
      });

      expect(roleRepository.findOne).toHaveBeenCalledWith({
        where: { name: 'CLIENT' },
      });
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          roleId: 'role-client-uuid',
          gymId: 'gym-1',
        }),
      );
    });

    it('lanza BadRequestException si no se envía gymId', async () => {
      await expect(
        authService.register({
          name: 'Sin gym',
          email: 'singym@smartbox.com',
          password: 'contraseña123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el correo ya está registrado', async () => {
      usersService.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        authService.register({
          name: 'Dup',
          email: 'dup@smartbox.com',
          password: 'contraseña123',
          gymId: 'gym-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el rol CLIENT no existe en el sistema', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      roleRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.register({
          name: 'Nuevo',
          email: 'nuevo@smartbox.com',
          password: 'contraseña123',
          gymId: 'gym-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('registerInternal', () => {
    it('lanza BadRequestException si no se envía roleName', async () => {
      await expect(
        authService.registerInternal({
          name: 'Interno',
          email: 'interno@smartbox.com',
          password: 'contraseña123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el rol solicitado no existe', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      roleRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.registerInternal({
          name: 'Interno',
          email: 'interno@smartbox.com',
          password: 'contraseña123',
          roleName: 'ADMIN',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el rol no es SUPER_ADMIN y no se envía gymId', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      roleRepository.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'ADMIN',
      });

      await expect(
        authService.registerInternal({
          name: 'Interno',
          email: 'interno@smartbox.com',
          password: 'contraseña123',
          roleName: 'ADMIN',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite crear un SUPER_ADMIN sin gymId', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      roleRepository.findOne.mockResolvedValue({
        id: 'role-super',
        name: 'SUPER_ADMIN',
      });
      usersService.create.mockResolvedValue({
        id: 'user-3',
        name: 'Super',
        email: 'super@smartbox.com',
        status: 'active',
      });

      await authService.registerInternal({
        name: 'Super',
        email: 'super@smartbox.com',
        password: 'contraseña123',
        roleName: 'SUPER_ADMIN',
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: 'role-super', gymId: undefined }),
      );
    });
  });
});
