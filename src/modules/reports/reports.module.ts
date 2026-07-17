import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Invoice } from '../memberships/entities/invoice.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassOrResource,
      Reservation,
      Invoice,
      Membership,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [TypeOrmModule, ReportsService],
})
export class ReportsModule {}
