import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { ReportsService } from './reports.service';
import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Invoice } from '../memberships/entities/invoice.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { CheckIn } from '../checkins/entities/check-in.entity';
import { Location } from '../locations/entities/location.entity';
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
    select: jest.Mock;
    getRawOne: jest.Mock;
  };
  let membershipRepository: { createQueryBuilder: jest.Mock };
  let checkInQueryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getCount: jest.Mock;
  };
  let checkInRepository: { createQueryBuilder: jest.Mock };
  let locationRepository: { findOne: jest.Mock };

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
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ sum: '0' }),
    };
    membershipRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(membershipQueryBuilder),
    };

    checkInQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    checkInRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(checkInQueryBuilder),
    };
    locationRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'location-a', gymId: 'gym-a' }),
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
        { provide: getRepositoryToken(CheckIn), useValue: checkInRepository },
        { provide: getRepositoryToken(Location), useValue: locationRepository },
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

    it('con locationId, filtra las clases por esa sucursal (filtro exacto)', async () => {
      await service.getOccupancy(admin, { locationId: 'location-a' });

      expect(locationRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'location-a' },
      });
      expect(classRepository.find).toHaveBeenCalledWith({
        where: { gymId: 'gym-a', locationId: 'location-a' },
      });
    });

    it('rechaza con ForbiddenException si la sucursal es de otro gimnasio', async () => {
      locationRepository.findOne.mockResolvedValue({
        id: 'location-b',
        gymId: 'gym-b',
      });

      await expect(
        service.getOccupancy(admin, { locationId: 'location-b' }),
      ).rejects.toThrow(ForbiddenException);
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

    it('con locationId, agrega una estimación proporcional según check-ins', async () => {
      invoiceQueryBuilder.getMany.mockResolvedValue([
        { amountCents: 1000, paidAt: new Date('2026-07-13T10:00:00.000Z') },
      ]);
      checkInQueryBuilder.getCount
        .mockResolvedValueOnce(20) // totalCheckInsCount
        .mockResolvedValueOnce(5); // checkInsCount de la sucursal

      const report = await service.getRevenue(admin, {
        locationId: 'location-a',
      });

      expect(report.locationEstimate).toEqual({
        locationId: 'location-a',
        checkInsCount: 5,
        totalCheckInsCount: 20,
        estimatedCents: 250, // 1000 * (5/20)
      });
    });

    it('con locationId pero sin check-ins en el rango, estimatedCents es null', async () => {
      checkInQueryBuilder.getCount.mockResolvedValue(0);

      const report = await service.getRevenue(admin, {
        locationId: 'location-a',
      });

      expect(report.locationEstimate?.estimatedCents).toBeNull();
    });

    it('sin locationId, no agrega locationEstimate', async () => {
      const report = await service.getRevenue(admin, {});

      expect(report.locationEstimate).toBeUndefined();
    });
  });

  describe('getFinance', () => {
    it('SUPER_ADMIN sin gymId en el query rechaza con BadRequestException', async () => {
      await expect(service.getFinance(superAdmin, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('calcula MRR/ARR desde la suma de price_cents de membresías activas', async () => {
      membershipQueryBuilder.getRawOne.mockResolvedValue({ sum: '15000' });
      membershipQueryBuilder.getCount
        .mockResolvedValueOnce(10) // activeMembersCount
        .mockResolvedValueOnce(0); // cancelledInRangeCount

      const report = await service.getFinance(admin, {});

      expect(report.mrrCents).toBe(15000);
      expect(report.arrCents).toBe(15000 * 12);
      expect(report.activeMembersCount).toBe(10);
    });

    it('churnRate 0 cuando no hay cancelaciones en el rango, LTV null', async () => {
      membershipQueryBuilder.getRawOne.mockResolvedValue({ sum: '10000' });
      membershipQueryBuilder.getCount
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0);

      const report = await service.getFinance(admin, {});

      expect(report.churnRate).toBe(0);
      expect(report.ltvCents).toBeNull();
    });

    it('calcula churnRate y LTV cuando hay cancelaciones en el rango', async () => {
      // 8 activos + 2 cancelados en el rango → churn = 2/10 = 0.2
      // avgRevenuePerMember = 10000/8 = 1250 → LTV = 1250/0.2 = 6250
      membershipQueryBuilder.getRawOne.mockResolvedValue({ sum: '10000' });
      membershipQueryBuilder.getCount
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2);

      const report = await service.getFinance(admin, {});

      expect(report.churnRate).toBe(0.2);
      expect(report.ltvCents).toBe(6250);
    });

    it('devuelve MRR/ARR en cero si no hay membresías activas', async () => {
      membershipQueryBuilder.getRawOne.mockResolvedValue({ sum: null });
      membershipQueryBuilder.getCount
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const report = await service.getFinance(admin, {});

      expect(report.mrrCents).toBe(0);
      expect(report.arrCents).toBe(0);
      expect(report.churnRate).toBe(0);
      expect(report.ltvCents).toBeNull();
    });

    it('con locationId, estima MRR/ARR proporcional según check-ins', async () => {
      membershipQueryBuilder.getRawOne.mockResolvedValue({ sum: '10000' });
      membershipQueryBuilder.getCount
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0);
      checkInQueryBuilder.getCount
        .mockResolvedValueOnce(4) // totalCheckInsCount
        .mockResolvedValueOnce(1); // checkInsCount de la sucursal

      const report = await service.getFinance(admin, {
        locationId: 'location-a',
      });

      expect(report.locationEstimate).toEqual({
        locationId: 'location-a',
        checkInsCount: 1,
        totalCheckInsCount: 4,
        estimatedMrrCents: 2500, // 10000 * (1/4)
        estimatedArrCents: 30000,
      });
    });

    it('rechaza con ForbiddenException si la sucursal es de otro gimnasio', async () => {
      locationRepository.findOne.mockResolvedValue({
        id: 'location-b',
        gymId: 'gym-b',
      });

      await expect(
        service.getFinance(admin, { locationId: 'location-b' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
