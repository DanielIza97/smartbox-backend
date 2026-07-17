import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { ReservationsService } from './reservations.service';
import { Reservation } from './entities/reservation.entity';
import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let reservationRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let classRepository: { findOne: jest.Mock };
  let membershipRepository: { findOne: jest.Mock };

  const client: AuthenticatedUser = {
    id: 'client-1',
    email: 'client@smartbox.com',
    role: 'CLIENT',
    gymId: 'gym-a',
  };

  // Lunes 09:00, en el futuro relativo a cualquier fecha razonable de test run.
  const nextMonday9am = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
    d.setHours(9, 0, 0, 0);
    return d;
  })();

  const validClass = {
    id: 'class-1',
    gymId: 'gym-a',
    capacity: 5,
    dayOfWeek: nextMonday9am.getDay(),
    startTime: '09:00',
    durationMinutes: 60,
  };

  beforeEach(async () => {
    reservationRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    classRepository = { findOne: jest.fn() };
    membershipRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: getRepositoryToken(Reservation),
          useValue: reservationRepository,
        },
        {
          provide: getRepositoryToken(ClassOrResource),
          useValue: classRepository,
        },
        {
          provide: getRepositoryToken(Membership),
          useValue: membershipRepository,
        },
      ],
    }).compile();

    service = module.get(ReservationsService);
  });

  describe('create', () => {
    it('rechaza si el solicitante no pertenece a ningún gimnasio', async () => {
      await expect(
        service.create(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          { ...client, gymId: null },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si la clase no existe', async () => {
      classRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          { classId: 'class-x', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza con ForbiddenException si la clase es de otro gimnasio', async () => {
      classRepository.findOne.mockResolvedValue({
        ...validClass,
        gymId: 'gym-b',
      });

      await expect(
        service.create(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza con mensaje explícito si la membresía no está active', async () => {
      classRepository.findOne.mockResolvedValue(validClass);
      membershipRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow('Necesitás una membresía activa para reservar.');
    });

    it('rechaza un horario que ya pasó', async () => {
      classRepository.findOne.mockResolvedValue(validClass);
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });

      const pastDate = new Date('2020-01-06T09:00:00'); // lunes en el pasado

      await expect(
        service.create(
          { classId: 'class-1', startAt: pastDate.toISOString() },
          client,
        ),
      ).rejects.toThrow('No podés reservar un horario que ya pasó.');
    });

    it('rechaza un horario que no corresponde al patrón recurrente de la clase', async () => {
      classRepository.findOne.mockResolvedValue(validClass);
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });

      const wrongTime = new Date(nextMonday9am);
      wrongTime.setHours(10, 0, 0, 0); // mismo día, hora distinta

      await expect(
        service.create(
          { classId: 'class-1', startAt: wrongTime.toISOString() },
          client,
        ),
      ).rejects.toThrow(
        'Ese horario no corresponde a un turno válido de esta clase.',
      );
    });

    it('rechaza si no hay cupo disponible', async () => {
      classRepository.findOne.mockResolvedValue(validClass);
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });
      reservationRepository.count.mockResolvedValue(5); // == capacity

      await expect(
        service.create(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow('No hay cupo disponible para ese horario.');
    });

    it('rechaza si el socio ya tiene una reserva confirmed que se superpone', async () => {
      classRepository.findOne.mockResolvedValue(validClass);
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });
      reservationRepository.findOne.mockResolvedValue({
        id: 'other-reservation',
      });

      await expect(
        service.create(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow(
        'Ya tenés una reserva que se superpone con ese horario.',
      );
    });

    it('crea la reserva confirmed cuando todas las validaciones pasan', async () => {
      classRepository.findOne.mockResolvedValue(validClass);
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });

      const result = await service.create(
        { classId: 'class-1', startAt: nextMonday9am.toISOString() },
        client,
      );

      expect(reservationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'client-1',
          classId: 'class-1',
          status: 'confirmed',
        }),
      );
      expect(result).toEqual(expect.objectContaining({ status: 'confirmed' }));
    });
  });

  describe('findAll', () => {
    it('CLIENT ve solo sus propias reservas', async () => {
      reservationRepository.find.mockResolvedValue([]);

      await service.findAll(client);

      expect(reservationRepository.find).toHaveBeenCalledWith({
        where: { userId: 'client-1' },
        relations: { classOrResource: true },
        order: { startAt: 'DESC' },
      });
    });

    it('ADMIN ve las reservas de su gimnasio, no todas', async () => {
      reservationRepository.find.mockResolvedValue([]);

      await service.findAll({
        id: 'admin-1',
        email: 'admin@smartbox.com',
        role: 'ADMIN',
        gymId: 'gym-a',
      });

      expect(reservationRepository.find).toHaveBeenCalledWith({
        where: { classOrResource: { gymId: 'gym-a' } },
        relations: { classOrResource: true },
        order: { startAt: 'DESC' },
      });
    });

    it('SUPER_ADMIN ve todas las reservas', async () => {
      reservationRepository.find.mockResolvedValue([]);

      await service.findAll({
        id: 'super-1',
        email: 'super@smartbox.com',
        role: 'SUPER_ADMIN',
        gymId: null,
      });

      expect(reservationRepository.find).toHaveBeenCalledWith({
        relations: { classOrResource: true },
        order: { startAt: 'DESC' },
      });
    });
  });

  describe('cancel', () => {
    it('lanza NotFoundException si la reserva no existe', async () => {
      reservationRepository.findOne.mockResolvedValue(null);

      await expect(service.cancel('res-x', client)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza si el solicitante no es el dueño ni ADMIN del gym', async () => {
      reservationRepository.findOne.mockResolvedValue({
        id: 'res-1',
        userId: 'other-client',
        status: 'confirmed',
        classOrResource: { gymId: 'gym-b' },
      });

      await expect(service.cancel('res-1', client)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('permite al dueño cancelar su propia reserva', async () => {
      reservationRepository.findOne.mockResolvedValue({
        id: 'res-1',
        userId: 'client-1',
        status: 'confirmed',
        classOrResource: { gymId: 'gym-a' },
      });
      reservationRepository.findOneOrFail.mockResolvedValue({
        id: 'res-1',
        status: 'cancelled',
      });

      await service.cancel('res-1', client);

      expect(reservationRepository.update).toHaveBeenCalledWith('res-1', {
        status: 'cancelled',
      });
      // La clase tiene que venir en la respuesta (mismo bug que se encontró
      // en MembershipsService.requestCancellation: el findOneOrFail final
      // sin relations dejaba al frontend sin el nombre de la clase).
      expect(reservationRepository.findOneOrFail).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        relations: { classOrResource: true },
      });
    });

    it('permite a un ADMIN del mismo gym cancelar la reserva de un socio', async () => {
      reservationRepository.findOne.mockResolvedValue({
        id: 'res-1',
        userId: 'other-client',
        status: 'confirmed',
        classOrResource: { gymId: 'gym-a' },
      });
      reservationRepository.findOneOrFail.mockResolvedValue({
        id: 'res-1',
        status: 'cancelled',
      });

      await service.cancel('res-1', {
        id: 'admin-1',
        email: 'admin@smartbox.com',
        role: 'ADMIN',
        gymId: 'gym-a',
      });

      expect(reservationRepository.update).toHaveBeenCalledWith('res-1', {
        status: 'cancelled',
      });
    });

    it('rechaza si la reserva ya no está confirmed', async () => {
      reservationRepository.findOne.mockResolvedValue({
        id: 'res-1',
        userId: 'client-1',
        status: 'cancelled',
        classOrResource: { gymId: 'gym-a' },
      });

      await expect(service.cancel('res-1', client)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('expireReservations', () => {
    it('actualiza en bloque las reservas confirmed vencidas a expired', async () => {
      await service.expireReservations();

      expect(reservationRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'confirmed' }),
        { status: 'expired' },
      );
    });
  });
});
