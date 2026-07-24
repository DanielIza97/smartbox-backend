import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { WaitlistService } from './waitlist.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('WaitlistService', () => {
  let service: WaitlistService;
  let waitlistRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let reservationRepository: {
    count: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let classRepository: { findOne: jest.Mock };
  let membershipRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let mailService: { sendWaitlistPromotedEmail: jest.Mock };

  const client: AuthenticatedUser = {
    id: 'client-1',
    email: 'client@smartbox.com',
    role: 'CLIENT',
    gymId: 'gym-a',
  };

  const nextMonday9am = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
    d.setHours(9, 0, 0, 0);
    return d;
  })();

  const fullClass = {
    id: 'class-1',
    name: 'Yoga',
    gymId: 'gym-a',
    capacity: 2,
    dayOfWeek: nextMonday9am.getDay(),
    startTime: '09:00',
    durationMinutes: 60,
  };

  beforeEach(async () => {
    waitlistRepository = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    reservationRepository = {
      count: jest.fn().mockResolvedValue(2), // == capacity, lleno por default
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    classRepository = { findOne: jest.fn().mockResolvedValue(fullClass) };
    membershipRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn() };
    mailService = {
      sendWaitlistPromotedEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        {
          provide: getRepositoryToken(WaitlistEntry),
          useValue: waitlistRepository,
        },
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
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(WaitlistService);
  });

  describe('join', () => {
    it('rechaza si el solicitante no pertenece a ningún gimnasio', async () => {
      await expect(
        service.join(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          { ...client, gymId: null },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si la clase no existe', async () => {
      classRepository.findOne.mockResolvedValue(null);

      await expect(
        service.join(
          { classId: 'class-x', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza con ForbiddenException si la clase es de otro gimnasio', async () => {
      classRepository.findOne.mockResolvedValue({
        ...fullClass,
        gymId: 'gym-b',
      });

      await expect(
        service.join(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza sin membresía activa', async () => {
      membershipRepository.findOne.mockResolvedValue(null);

      await expect(
        service.join(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow(
        'Necesitás una membresía activa para anotarte en la lista de espera.',
      );
    });

    it('rechaza si hay cupo disponible en vez de estar lleno', async () => {
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });
      reservationRepository.count.mockResolvedValue(1); // < capacity (2)

      await expect(
        service.join(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow('Hay cupo disponible, reservá directamente.');
    });

    it('rechaza si ya está anotado en esa lista de espera', async () => {
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });
      waitlistRepository.findOne.mockResolvedValue({ id: 'entry-existente' });

      await expect(
        service.join(
          { classId: 'class-1', startAt: nextMonday9am.toISOString() },
          client,
        ),
      ).rejects.toThrow('Ya estás en la lista de espera de ese horario.');
    });

    it('se anota en la lista de espera cuando el turno está lleno', async () => {
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });

      const result = await service.join(
        { classId: 'class-1', startAt: nextMonday9am.toISOString() },
        client,
      );

      expect(waitlistRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'client-1', classId: 'class-1' }),
      );
      expect(result).toEqual(expect.objectContaining({ userId: 'client-1' }));
    });
  });

  describe('leave', () => {
    it('lanza NotFoundException si la entrada no existe', async () => {
      await expect(service.leave('x', client)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza si no es el dueño ni ADMIN/SUPER_ADMIN', async () => {
      waitlistRepository.findOne.mockResolvedValue({
        id: 'entry-1',
        userId: 'other-client',
      });

      await expect(service.leave('entry-1', client)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('permite al dueño salir de la lista', async () => {
      waitlistRepository.findOne.mockResolvedValue({
        id: 'entry-1',
        userId: 'client-1',
      });

      await service.leave('entry-1', client);

      expect(waitlistRepository.delete).toHaveBeenCalledWith('entry-1');
    });
  });

  describe('tryPromote', () => {
    it('no hace nada si no hay entradas en la lista de espera', async () => {
      waitlistRepository.findOne.mockResolvedValue(null);

      await service.tryPromote('class-1', nextMonday9am);

      expect(reservationRepository.save).not.toHaveBeenCalled();
    });

    it('descarta la entrada y no promueve si la membresía ya no está activa', async () => {
      waitlistRepository.findOne
        .mockResolvedValueOnce({
          id: 'entry-1',
          userId: 'client-1',
          classId: 'class-1',
          startAt: nextMonday9am,
        })
        .mockResolvedValueOnce(null); // no queda nadie más
      membershipRepository.findOne.mockResolvedValue(null); // sin membresía activa

      await service.tryPromote('class-1', nextMonday9am);

      expect(waitlistRepository.delete).toHaveBeenCalledWith('entry-1');
      expect(reservationRepository.save).not.toHaveBeenCalled();
    });

    it('promueve al primero de la lista y le crea una Reservation confirmed', async () => {
      waitlistRepository.findOne.mockResolvedValueOnce({
        id: 'entry-1',
        userId: 'client-1',
        classId: 'class-1',
        startAt: nextMonday9am,
      });
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });
      reservationRepository.findOne.mockResolvedValue(null); // sin solapamiento
      userRepository.findOne.mockResolvedValue({
        id: 'client-1',
        email: 'client@smartbox.com',
      });

      await service.tryPromote('class-1', nextMonday9am);

      expect(reservationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'client-1',
          classId: 'class-1',
          status: 'confirmed',
        }),
      );
      expect(waitlistRepository.delete).toHaveBeenCalledWith('entry-1');
      expect(mailService.sendWaitlistPromotedEmail).toHaveBeenCalledWith(
        'client@smartbox.com',
        'Yoga',
        nextMonday9am,
      );
    });

    it('salta al candidato con solapamiento y prueba el siguiente', async () => {
      waitlistRepository.findOne
        .mockResolvedValueOnce({
          id: 'entry-1',
          userId: 'client-1',
          classId: 'class-1',
          startAt: nextMonday9am,
        })
        .mockResolvedValueOnce({
          id: 'entry-2',
          userId: 'client-2',
          classId: 'class-1',
          startAt: nextMonday9am,
        })
        .mockResolvedValueOnce(null);
      membershipRepository.findOne.mockResolvedValue({ status: 'active' });
      reservationRepository.findOne
        .mockResolvedValueOnce({ id: 'otra-reserva' }) // client-1 se solapa
        .mockResolvedValueOnce(null); // client-2 no se solapa
      userRepository.findOne.mockResolvedValue({
        id: 'client-2',
        email: 'client2@smartbox.com',
      });

      await service.tryPromote('class-1', nextMonday9am);

      expect(waitlistRepository.delete).toHaveBeenCalledWith('entry-1');
      expect(reservationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'client-2', status: 'confirmed' }),
      );
      expect(waitlistRepository.delete).toHaveBeenCalledWith('entry-2');
    });
  });
});
