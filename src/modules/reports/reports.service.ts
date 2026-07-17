import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Invoice } from '../memberships/entities/invoice.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { ReportQueryDto } from './dto/report-query.dto';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { computeOccurrences } from '../classes/occurrence.util';

const DEFAULT_REPORT_WINDOW_DAYS = 7;

export interface OccupancySlot {
  classId: string;
  className: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
  booked: number;
  occupancyRate: number;
}

export interface OccupancyReport {
  from: Date;
  to: Date;
  slots: OccupancySlot[];
  averageOccupancyRate: number;
}

export interface RevenueDay {
  date: string;
  totalCents: number;
}

export interface RevenueReport {
  from: Date;
  to: Date;
  days: RevenueDay[];
  totalCents: number;
  activeMembersCount: number;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ClassOrResource)
    private readonly classRepository: Repository<ClassOrResource>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
  ) {}

  // SUPER_ADMIN no tiene gymId propio — un reporte es inherentemente de un
  // gimnasio, así que exige el query param explícito en vez de agregar
  // datos de todos los gimnasios mezclados (no tendría sentido de negocio
  // para un reporte de ingresos). ADMIN/STAFF siempre ven el propio,
  // ignorando cualquier gymId que manden.
  private resolveGymId(
    requester: AuthenticatedUser,
    query: ReportQueryDto,
  ): string {
    if (requester.role === 'SUPER_ADMIN') {
      if (!query.gymId) {
        throw new BadRequestException('gymId es obligatorio para SUPER_ADMIN.');
      }
      return query.gymId;
    }
    return requester.gymId ?? '';
  }

  private resolveRange(query: ReportQueryDto): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(
          to.getTime() - DEFAULT_REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );
    return { from, to };
  }

  async getOccupancy(
    requester: AuthenticatedUser,
    query: ReportQueryDto,
  ): Promise<OccupancyReport> {
    const gymId = this.resolveGymId(requester, query);
    const { from, to } = this.resolveRange(query);

    const classes = await this.classRepository.find({ where: { gymId } });

    const slots: OccupancySlot[] = [];
    for (const classOrResource of classes) {
      const occurrences = computeOccurrences(classOrResource, from, to);
      for (const occurrence of occurrences) {
        const booked = await this.reservationRepository.count({
          where: {
            classId: classOrResource.id,
            startAt: occurrence.startAt,
            status: 'confirmed',
          },
        });
        slots.push({
          classId: classOrResource.id,
          className: classOrResource.name,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          capacity: classOrResource.capacity,
          booked,
          occupancyRate:
            classOrResource.capacity > 0
              ? booked / classOrResource.capacity
              : 0,
        });
      }
    }

    const averageOccupancyRate =
      slots.length > 0
        ? slots.reduce((sum, slot) => sum + slot.occupancyRate, 0) /
          slots.length
        : 0;

    return { from, to, slots, averageOccupancyRate };
  }

  async getRevenue(
    requester: AuthenticatedUser,
    query: ReportQueryDto,
  ): Promise<RevenueReport> {
    const gymId = this.resolveGymId(requester, query);
    const { from, to } = this.resolveRange(query);

    const invoices = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.membership', 'membership')
      .innerJoin('membership.plan', 'plan')
      .where('plan.gym_id = :gymId', { gymId })
      .andWhere('invoice.status = :status', { status: 'approved' })
      .andWhere('invoice.paid_at BETWEEN :from AND :to', { from, to })
      .getMany();

    const totalsByDay = new Map<string, number>();
    for (const invoice of invoices) {
      const date = (invoice.paidAt as Date).toISOString().slice(0, 10);
      totalsByDay.set(date, (totalsByDay.get(date) ?? 0) + invoice.amountCents);
    }
    const days: RevenueDay[] = Array.from(totalsByDay.entries())
      .map(([date, totalCents]) => ({ date, totalCents }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalCents = invoices.reduce(
      (sum, invoice) => sum + invoice.amountCents,
      0,
    );

    const activeMembersCount = await this.membershipRepository
      .createQueryBuilder('membership')
      .innerJoin('membership.plan', 'plan')
      .where('plan.gym_id = :gymId', { gymId })
      .andWhere('membership.status = :status', { status: 'active' })
      .getCount();

    return { from, to, days, totalCents, activeMembersCount };
  }
}
