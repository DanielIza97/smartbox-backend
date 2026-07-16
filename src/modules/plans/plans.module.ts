import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Plan } from './entities/plan.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { MercadoPagoModule } from '../../common/mercadopago/mercadopago.module';
import { GymsModule } from '../gyms/gyms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan, Gym]),
    MercadoPagoModule,
    GymsModule,
  ],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [TypeOrmModule, PlansService],
})
export class PlansModule {}
