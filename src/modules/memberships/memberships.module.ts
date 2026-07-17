import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Membership } from './entities/membership.entity';
import { ProcessedWebhookEvent } from './entities/processed-webhook-event.entity';
import { Invoice } from './entities/invoice.entity';
import { Plan } from '../plans/entities/plan.entity';
import { User } from '../users/user.entity';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { MercadoPagoModule } from '../../common/mercadopago/mercadopago.module';
import { GymsModule } from '../gyms/gyms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Membership,
      ProcessedWebhookEvent,
      Invoice,
      Plan,
      User,
    ]),
    MercadoPagoModule,
    GymsModule,
  ],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [TypeOrmModule, MembershipsService],
})
export class MembershipsModule {}
