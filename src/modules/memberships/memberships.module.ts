import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Membership } from './entities/membership.entity';
import { Plan } from '../plans/entities/plan.entity';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { MercadoPagoModule } from '../../common/mercadopago/mercadopago.module';
import { GymsModule } from '../gyms/gyms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Membership, Plan]),
    MercadoPagoModule,
    GymsModule,
  ],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [TypeOrmModule, MembershipsService],
})
export class MembershipsModule {}
