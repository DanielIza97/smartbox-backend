import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { ShiftsService } from './shifts.service';
import { Shift } from './entities/shift.entity';
import { User } from '../users/user.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let shiftRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@smartbox.com',
    role: 'ADMIN',
    gymId: 'gym-a',
  };

  const staffUser = {
    id: 'staff-1',
    role: { name: 'STAFF' },
    gym: { id: 'gym-a' },
  };

  beforeEach(async () => {
    shiftRepository = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    userRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: getRepositoryToken(Shift), useValue: shiftRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    service = module.get(ShiftsService);
  });

  describe('create', () => {
    const dto = {
      staffId: 'staff-1',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    };

    it('lanza NotFoundException si el usuario no existe', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto, admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza si el usuario no tiene rol STAFF', async () => {
      userRepository.findOne.mockResolvedValue({
        ...staffUser,
        role: { name: 'CLIENT' },
      });

      await expect(service.create(dto, admin)).rejects.toThrow(
        'El usuario especificado no tiene rol STAFF.',
      );
    });

    it('rechaza con ForbiddenException si el STAFF es de otro gimnasio', async () => {
      userRepository.findOne.mockResolvedValue({
        ...staffUser,
        gym: { id: 'gym-b' },
      });

      await expect(service.create(dto, admin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rechaza si startTime no es anterior a endTime', async () => {
      userRepository.findOne.mockResolvedValue(staffUser);

      await expect(
        service.create({ ...dto, startTime: '18:00', endTime: '17:00' }, admin),
      ).rejects.toThrow('startTime debe ser anterior a endTime.');
    });

    it('rechaza si se superpone con otro turno del mismo STAFF', async () => {
      userRepository.findOne.mockResolvedValue(staffUser);
      shiftRepository.findOne.mockResolvedValue({ id: 'shift-existing' });

      await expect(service.create(dto, admin)).rejects.toThrow(
        'Ese turno se superpone con otro turno existente del mismo STAFF.',
      );
    });

    it('crea el turno cuando todas las validaciones pasan', async () => {
      userRepository.findOne.mockResolvedValue(staffUser);

      const result = await service.create(dto, admin);

      expect(shiftRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          staffId: 'staff-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
        }),
      );
      expect(result).toEqual(expect.objectContaining({ staffId: 'staff-1' }));
    });

    it('SUPER_ADMIN puede crear un turno para STAFF de cualquier gimnasio', async () => {
      userRepository.findOne.mockResolvedValue({
        ...staffUser,
        gym: { id: 'gym-b' },
      });

      const superAdmin: AuthenticatedUser = {
        id: 'super-1',
        email: 'super@smartbox.com',
        role: 'SUPER_ADMIN',
        gymId: null,
      };

      await expect(service.create(dto, superAdmin)).resolves.toBeDefined();
    });
  });

  describe('findAll', () => {
    it('ADMIN ve solo los turnos de su gimnasio', async () => {
      shiftRepository.find.mockResolvedValue([]);

      await service.findAll(admin);

      expect(shiftRepository.find).toHaveBeenCalledWith({
        where: { staff: { gym: { id: 'gym-a' } } },
        relations: { staff: { gym: true } },
      });
    });

    it('SUPER_ADMIN ve todos los turnos', async () => {
      shiftRepository.find.mockResolvedValue([]);

      await service.findAll({
        id: 'super-1',
        email: 'super@smartbox.com',
        role: 'SUPER_ADMIN',
        gymId: null,
      });

      expect(shiftRepository.find).toHaveBeenCalledWith({
        relations: { staff: true },
      });
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si el turno no existe', async () => {
      shiftRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('shift-x', admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza con ForbiddenException si el turno es de otro gimnasio', async () => {
      shiftRepository.findOne.mockResolvedValue({
        id: 'shift-1',
        staff: { gym: { id: 'gym-b' } },
      });

      await expect(service.findOne('shift-1', admin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('devuelve el turno si pertenece al mismo gimnasio', async () => {
      const shift = { id: 'shift-1', staff: { gym: { id: 'gym-a' } } };
      shiftRepository.findOne.mockResolvedValue(shift);

      const result = await service.findOne('shift-1', admin);

      expect(result).toBe(shift);
    });
  });
});
