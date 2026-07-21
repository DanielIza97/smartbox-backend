import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UsersService } from './users.service';
import { User } from './user.entity';
import { Role } from '../roles/entities/role.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { MailService } from '../mail/mail.service';
import { TokenService } from '../../common/token/token.service';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    merge: jest.Mock;
  };
  let roleRepository: { findOne: jest.Mock };
  let gymRepository: { findOne: jest.Mock };

  const superAdmin: AuthenticatedUser = {
    id: 'super-1',
    email: 'super@smartbox.com',
    role: 'SUPER_ADMIN',
    gymId: null,
  };
  const gymAAdmin: AuthenticatedUser = {
    id: 'admin-a',
    email: 'admin-a@smartbox.com',
    role: 'ADMIN',
    gymId: 'gym-a',
  };

  beforeEach(async () => {
    userRepository = {
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
      merge: jest.fn((entity: object, data: object) => ({
        ...entity,
        ...data,
      })),
    };
    roleRepository = { findOne: jest.fn() };
    gymRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Role), useValue: roleRepository },
        { provide: getRepositoryToken(Gym), useValue: gymRepository },
        {
          provide: MailService,
          useValue: { sendEmailChangeVerification: jest.fn() },
        },
        TokenService,
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('create', () => {
    it('rechaza gymId para un rol SUPER_ADMIN', async () => {
      roleRepository.findOne.mockResolvedValue({
        id: 'role-super',
        name: 'SUPER_ADMIN',
      });

      await expect(
        service.create({
          name: 'X',
          email: 'x@smartbox.com',
          password: 'contraseña123',
          roleId: 'role-super',
          gymId: 'gym-a',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('exige gymId para roles distintos de SUPER_ADMIN', async () => {
      roleRepository.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'ADMIN',
      });

      await expect(
        service.create({
          name: 'X',
          email: 'x@smartbox.com',
          password: 'contraseña123',
          roleId: 'role-admin',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el gimnasio indicado no existe', async () => {
      roleRepository.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'ADMIN',
      });
      gymRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'X',
          email: 'x@smartbox.com',
          password: 'contraseña123',
          roleId: 'role-admin',
          gymId: 'gym-inexistente',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea el usuario cuando el rol y el gimnasio son válidos', async () => {
      roleRepository.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'ADMIN',
      });
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });

      const result = await service.create({
        name: 'X',
        email: 'x@smartbox.com',
        password: 'contraseña123',
        roleId: 'role-admin',
        gymId: 'gym-a',
      });

      expect(userRepository.save).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          role: { id: 'role-admin' },
          gym: { id: 'gym-a' },
          status: 'active',
        }),
      );
    });

    it('hashea la contraseña antes de guardarla — nunca en texto plano', async () => {
      roleRepository.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'ADMIN',
      });
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });

      const result = await service.create({
        name: 'X',
        email: 'x@smartbox.com',
        password: 'contraseña123',
        roleId: 'role-admin',
        gymId: 'gym-a',
      });

      expect(result.password).not.toBe('contraseña123');
      await expect(
        bcrypt.compare('contraseña123', result.password),
      ).resolves.toBe(true);
    });
  });

  describe('findAll', () => {
    it('SUPER_ADMIN ve usuarios de todos los gimnasios', async () => {
      userRepository.find.mockResolvedValue([]);

      await service.findAll(superAdmin);

      expect(userRepository.find).toHaveBeenCalledWith({
        relations: { role: true, gym: true },
      });
    });

    it('un ADMIN solo ve usuarios de su propio gimnasio', async () => {
      userRepository.find.mockResolvedValue([]);

      await service.findAll(gymAAdmin);

      expect(userRepository.find).toHaveBeenCalledWith({
        where: { gym: { id: 'gym-a' } },
        relations: { role: true, gym: true },
      });
    });
  });

  describe('findOneScoped', () => {
    it('permite a un ADMIN ver un usuario de su propio gimnasio', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        gym: { id: 'gym-a' },
      });

      const result = await service.findOneScoped('user-1', gymAAdmin);
      expect(result.id).toBe('user-1');
    });

    it('devuelve 403 (ForbiddenException), no 404, si el usuario pertenece a otro gimnasio', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-2',
        gym: { id: 'gym-b' },
      });

      await expect(service.findOneScoped('user-2', gymAAdmin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('SUPER_ADMIN puede ver usuarios de cualquier gimnasio', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-2',
        gym: { id: 'gym-b' },
      });

      const result = await service.findOneScoped('user-2', superAdmin);
      expect(result.id).toBe('user-2');
    });
  });

  describe('update', () => {
    it('rechaza que un ADMIN reasigne el gimnasio de un usuario', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        gym: { id: 'gym-a' },
      });

      await expect(
        service.update('user-1', { gymId: 'gym-b' }, gymAAdmin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite que un SUPER_ADMIN reasigne el gimnasio de un usuario', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        gym: { id: 'gym-a' },
      });

      await service.update('user-1', { gymId: 'gym-b' }, superAdmin);

      expect(userRepository.save).toHaveBeenCalled();
    });

    it('rechaza que un ADMIN se asigne (o asigne a otro) el rol SUPER_ADMIN', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'admin-a',
        gym: { id: 'gym-a' },
      });
      roleRepository.findOne.mockResolvedValue({
        id: 'role-super',
        name: 'SUPER_ADMIN',
      });

      await expect(
        service.update('admin-a', { roleId: 'role-super' }, gymAAdmin),
      ).rejects.toThrow(ForbiddenException);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza un roleId inválido cuando lo asigna un no-SUPER_ADMIN', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        gym: { id: 'gym-a' },
      });
      roleRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('user-1', { roleId: 'role-inexistente' }, gymAAdmin),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite que un ADMIN reasigne un rol que no sea SUPER_ADMIN', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        gym: { id: 'gym-a' },
      });
      roleRepository.findOne.mockResolvedValue({
        id: 'role-staff',
        name: 'STAFF',
      });

      await service.update('user-1', { roleId: 'role-staff' }, gymAAdmin);

      expect(userRepository.save).toHaveBeenCalled();
    });

    it('permite que un SUPER_ADMIN asigne el rol SUPER_ADMIN sin consultar el rol', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        gym: { id: 'gym-a' },
      });

      await service.update('user-1', { roleId: 'role-super' }, superAdmin);

      expect(roleRepository.findOne).not.toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
    });
  });
});
