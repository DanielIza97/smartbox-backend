import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { CheckInsService } from './checkins.service';
import { CheckIn } from './entities/check-in.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { User } from '../users/user.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('CheckInsService', () => {
  let service: CheckInsService;
  let checkInRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let reservationRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };

  const client: AuthenticatedUser = {
    id: 'client-1',
    email: 'client@smartbox.com',
    role: 'CLIENT',
    gymId: 'gym-a',
  };
  const staff: AuthenticatedUser = {
    id: 'staff-1',
    email: 'staff@smartbox.com',
    role: 'STAFF',
    gymId: 'gym-a',
  };

  beforeEach(async () => {
    checkInRepository = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    reservationRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckInsService,
        { provide: getRepositoryToken(CheckIn), useValue: checkInRepository },
        {
          provide: getRepositoryToken(Reservation),
          useValue: reservationRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    service = module.get(CheckInsService);
  });

  describe('checkIn', () => {
    it('CLIENT se registra a sí mismo, ignorando cualquier userId del body', async () => {
      const result = await service.checkIn(
        { userId: 'otro-id-cualquiera' },
        client,
      );

      expect(checkInRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'client-1', gymId: 'gym-a' }),
      );
      expect(result).toEqual(
        expect.objectContaining({ userId: 'client-1', gymId: 'gym-a' }),
      );
    });

    it('CLIENT sin gimnasio rechaza con BadRequestException', async () => {
      await expect(
        service.checkIn({}, { ...client, gymId: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('STAFF sin userId en el body rechaza con BadRequestException', async () => {
      await expect(service.checkIn({}, staff)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('STAFF registrando a un socio de otro gimnasio rechaza con ForbiddenException', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'client-2',
        gym: { id: 'gym-b' },
      });

      await expect(
        service.checkIn({ userId: 'client-2' }, staff),
      ).rejects.toThrow(ForbiddenException);
    });

    it('STAFF registra a un socio de su propio gimnasio', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'client-2',
        gym: { id: 'gym-a' },
      });

      const result = await service.checkIn({ userId: 'client-2' }, staff);

      expect(result).toEqual(
        expect.objectContaining({ userId: 'client-2', gymId: 'gym-a' }),
      );
    });

    it('rechaza si la reserva indicada no existe', async () => {
      reservationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.checkIn({ reservationId: 'res-x' }, client),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la reserva no está confirmed', async () => {
      reservationRepository.findOne.mockResolvedValue({
        id: 'res-1',
        userId: 'client-1',
        status: 'cancelled',
      });

      await expect(
        service.checkIn({ reservationId: 'res-1' }, client),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si ya hay un check-in activo para esa reserva', async () => {
      reservationRepository.findOne.mockResolvedValue({
        id: 'res-1',
        userId: 'client-1',
        status: 'confirmed',
      });
      checkInRepository.findOne.mockResolvedValue({
        id: 'checkin-1',
        checkedOutAt: null,
      });

      await expect(
        service.checkIn({ reservationId: 'res-1' }, client),
      ).rejects.toThrow('Ya hay un check-in activo para esta reserva.');
    });

    it('registra el check-in vinculado a la reserva cuando todo es válido', async () => {
      reservationRepository.findOne.mockResolvedValue({
        id: 'res-1',
        userId: 'client-1',
        status: 'confirmed',
      });

      const result = await service.checkIn({ reservationId: 'res-1' }, client);

      expect(result).toEqual(
        expect.objectContaining({ reservationId: 'res-1' }),
      );
    });
  });

  describe('checkOut', () => {
    it('lanza NotFoundException si el check-in no existe', async () => {
      checkInRepository.findOne.mockResolvedValue(null);

      await expect(service.checkOut('x', client)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza si no es el dueño ni STAFF/ADMIN/SUPER_ADMIN del gym', async () => {
      checkInRepository.findOne.mockResolvedValue({
        id: 'checkin-1',
        userId: 'other-client',
        gymId: 'gym-b',
        checkedOutAt: null,
      });

      await expect(service.checkOut('checkin-1', client)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rechaza si ya tiene check-out registrado', async () => {
      checkInRepository.findOne.mockResolvedValue({
        id: 'checkin-1',
        userId: 'client-1',
        gymId: 'gym-a',
        checkedOutAt: new Date(),
      });

      await expect(service.checkOut('checkin-1', client)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('permite al dueño hacer check-out', async () => {
      checkInRepository.findOne.mockResolvedValue({
        id: 'checkin-1',
        userId: 'client-1',
        gymId: 'gym-a',
        checkedOutAt: null,
      });
      checkInRepository.findOneOrFail.mockResolvedValue({
        id: 'checkin-1',
        checkedOutAt: new Date(),
      });

      await service.checkOut('checkin-1', client);

      const [id, update] = checkInRepository.update.mock.calls[0] as [
        string,
        { checkedOutAt: Date },
      ];
      expect(id).toBe('checkin-1');
      expect(update.checkedOutAt).toBeInstanceOf(Date);
    });
  });

  describe('findAll', () => {
    it('CLIENT ve solo sus propios check-ins', async () => {
      checkInRepository.find.mockResolvedValue([]);

      await service.findAll(client);

      expect(checkInRepository.find).toHaveBeenCalledWith({
        where: { userId: 'client-1' },
        order: { checkedInAt: 'DESC' },
      });
    });

    it('STAFF/ADMIN ven los check-ins de su gimnasio', async () => {
      checkInRepository.find.mockResolvedValue([]);

      await service.findAll(staff);

      expect(checkInRepository.find).toHaveBeenCalledWith({
        where: { gymId: 'gym-a' },
        order: { checkedInAt: 'DESC' },
      });
    });

    it('SUPER_ADMIN ve todos los check-ins', async () => {
      checkInRepository.find.mockResolvedValue([]);

      await service.findAll({
        id: 'super-1',
        email: 'super@smartbox.com',
        role: 'SUPER_ADMIN',
        gymId: null,
      });

      expect(checkInRepository.find).toHaveBeenCalledWith({
        order: { checkedInAt: 'DESC' },
      });
    });
  });
});
