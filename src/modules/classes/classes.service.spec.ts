import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { ClassesService } from './classes.service';
import { ClassOrResource } from './entities/class-or-resource.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('ClassesService', () => {
  let service: ClassesService;
  let classRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let gymRepository: { findOne: jest.Mock };
  let reservationRepository: { count: jest.Mock };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@smartbox.com',
    role: 'ADMIN',
    gymId: 'gym-a',
  };
  const client: AuthenticatedUser = {
    id: 'client-1',
    email: 'client@smartbox.com',
    role: 'CLIENT',
    gymId: 'gym-a',
  };

  beforeEach(async () => {
    classRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    gymRepository = { findOne: jest.fn() };
    reservationRepository = { count: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        {
          provide: getRepositoryToken(ClassOrResource),
          useValue: classRepository,
        },
        { provide: getRepositoryToken(Gym), useValue: gymRepository },
        {
          provide: getRepositoryToken(Reservation),
          useValue: reservationRepository,
        },
      ],
    }).compile();

    service = module.get(ClassesService);
  });

  describe('create', () => {
    it('rechaza si no se especifica gymId', async () => {
      await expect(
        service.create({
          name: 'Yoga',
          capacity: 10,
          dayOfWeek: 1,
          startTime: '09:00',
          durationMinutes: 60,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el gimnasio no existe', async () => {
      gymRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Yoga',
          capacity: 10,
          dayOfWeek: 1,
          startTime: '09:00',
          durationMinutes: 60,
          gymId: 'gym-x',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea la clase con el gymId dado', async () => {
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });

      const result = await service.create({
        name: 'Yoga',
        capacity: 10,
        dayOfWeek: 1,
        startTime: '09:00',
        durationMinutes: 60,
        gymId: 'gym-a',
      });

      expect(classRepository.save).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ name: 'Yoga', gymId: 'gym-a' }),
      );
    });
  });

  describe('findAll', () => {
    it('SUPER_ADMIN ve todas las clases', async () => {
      const superAdmin: AuthenticatedUser = {
        ...admin,
        role: 'SUPER_ADMIN',
        gymId: null,
      };
      classRepository.find.mockResolvedValue([{ id: 'class-1' }]);

      await service.findAll(superAdmin);

      expect(classRepository.find).toHaveBeenCalledWith();
    });

    it('ADMIN ve solo las clases de su gimnasio', async () => {
      classRepository.find.mockResolvedValue([]);

      await service.findAll(admin);

      expect(classRepository.find).toHaveBeenCalledWith({
        where: { gymId: 'gym-a' },
      });
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si la clase no existe', async () => {
      classRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('class-x', admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza con ForbiddenException si la clase es de otro gimnasio', async () => {
      classRepository.findOne.mockResolvedValue({
        id: 'class-1',
        gymId: 'gym-b',
      });

      await expect(service.findOne('class-1', admin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('devuelve la clase si pertenece al mismo gimnasio', async () => {
      const cls = { id: 'class-1', gymId: 'gym-a' };
      classRepository.findOne.mockResolvedValue(cls);

      const result = await service.findOne('class-1', client);

      expect(result).toBe(cls);
    });
  });

  describe('getAvailability', () => {
    it('devuelve los turnos con cupo restante calculado a partir de las reservas confirmadas', async () => {
      classRepository.findOne.mockResolvedValue({
        id: 'class-1',
        gymId: 'gym-a',
        capacity: 5,
        dayOfWeek: 1,
        startTime: '09:00',
        durationMinutes: 60,
      });
      reservationRepository.count.mockResolvedValue(3);

      const from = new Date('2026-07-13T00:00:00');
      const to = new Date('2026-07-13T23:59:59');

      const slots = await service.getAvailability('class-1', admin, {
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(slots).toHaveLength(1);
      expect(slots[0]).toEqual(
        expect.objectContaining({ capacity: 5, available: 2 }),
      );
    });

    it('nunca devuelve disponibilidad negativa aunque haya sobreventa', async () => {
      classRepository.findOne.mockResolvedValue({
        id: 'class-1',
        gymId: 'gym-a',
        capacity: 5,
        dayOfWeek: 1,
        startTime: '09:00',
        durationMinutes: 60,
      });
      reservationRepository.count.mockResolvedValue(9);

      const from = new Date('2026-07-13T00:00:00');
      const to = new Date('2026-07-13T23:59:59');

      const slots = await service.getAvailability('class-1', admin, {
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(slots[0].available).toBe(0);
    });

    it('propaga el 403 de findOne si la clase es de otro gimnasio', async () => {
      classRepository.findOne.mockResolvedValue({
        id: 'class-1',
        gymId: 'gym-b',
      });

      await expect(
        service.getAvailability('class-1', admin, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
