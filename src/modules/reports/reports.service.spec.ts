import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';

import { ReportsService } from './reports.service';
import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Invoice } from '../memberships/entities/invoice.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('ReportsService', () => {
  let service: ReportsService;
  let classRepository: { find: jest.Mock };
  let reservationRepository: { count: jest.Mock };
  let invoiceQueryBuilder: {
    innerJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getMany: jest.Mock;
  };
  let invoiceRepository: { createQueryBuilder: jest.Mock };
  let membershipQueryBuilder: {
    innerJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getCount: jest.Mock;
  };
  let membershipRepository: { createQueryBuilder: jest.Mock };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@smartbox.com',
    role: 'ADMIN',
    gymId: 'gym-a',
  };
  const superAdmin: AuthenticatedUser = {
    id: 'super-1',
    email: 'super@smartbox.com',
    role: 'SUPER_ADMIN',
    gymId: null,
  };

  beforeEach(async () => {
    classRepository = { find: jest.fn().mockResolvedValue([]) };
    reservationRepository = { count: jest.fn().mockResolvedValue(0) };

    invoiceQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    invoiceRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(invoiceQueryBuilder),
    };

    membershipQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    membershipRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(membershipQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(ClassOrResource),
          useValue: classRepository,
        },
        {
          provide: getRepositoryToken(Reservation),
          useValue: reservationRepository,
        },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepository },
        {
          provide: getRepositoryToken(Membership),
          useValue: membershipRepository,
        },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  describe('getOccupancy', () => {
    it('SUPER_ADMIN sin gymId en el query rechaza con BadRequestException', async () => {
      await expect(service.getOccupancy(superAdmin, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ADMIN usa su propio gymId, ignorando el gymId del query', async () => {
      await service.getOccupancy(admin, { gymId: 'gym-otro' });

      expect(classRepository.find).toHaveBeenCalledWith({
        where: { gymId: 'gym-a' },
      });
    });

    it('calcula occupancyRate por turno y el promedio general', async () => {
      classRepository.find.mockResolvedValue([
        {
          id: 'class-1',
          name: 'Yoga',
          gymId: 'gym-a',
          capacity: 4,
          dayOfWeek: 1,
          startTime: '09:00',
          durationMinutes: 60,
        },
      ]);
      reservationRepository.count.mockResolvedValue(2);

      const from = new Date('2026-07-13T00:00:00');
      const to = new Date('2026-07-13T23:59:59');

      const report = await service.getOccupancy(admin, {
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(report.slots).toHaveLength(1);
      expect(report.slots[0]).toEqual(
        expect.objectContaining({
          classId: 'class-1',
          capacity: 4,
          booked: 2,
          occupancyRate: 0.5,
        }),
      );
      expect(report.averageOccupancyRate).toBe(0.5);
    });

    it('devuelve promedio 0 si no hay turnos en el rango', async () => {
      const report = await service.getOccupancy(admin, {});

      expect(report.slots).toEqual([]);
      expect(report.averageOccupancyRate).toBe(0);
    });
  });

  describe('getRevenue', () => {
    it('SUPER_ADMIN sin gymId en el query rechaza con BadRequestException', async () => {
      await expect(service.getRevenue(superAdmin, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('agrupa los ingresos aprobados por día y calcula el total', async () => {
      invoiceQueryBuilder.getMany.mockResolvedValue([
        { amountCents: 1000, paidAt: new Date('2026-07-13T10:00:00.000Z') },
        { amountCents: 2000, paidAt: new Date('2026-07-13T15:00:00.000Z') },
        { amountCents: 500, paidAt: new Date('2026-07-14T10:00:00.000Z') },
      ]);
      membershipQueryBuilder.getCount.mockResolvedValue(7);

      const report = await service.getRevenue(admin, {});

      expect(report.days).toEqual([
        { date: '2026-07-13', totalCents: 3000 },
        { date: '2026-07-14', totalCents: 500 },
      ]);
      expect(report.totalCents).toBe(3500);
      expect(report.activeMembersCount).toBe(7);
    });

    it('devuelve totales en cero si no hay facturas aprobadas en el rango', async () => {
      const report = await service.getRevenue(admin, {});

      expect(report.days).toEqual([]);
      expect(report.totalCents).toBe(0);
    });
  });
});
