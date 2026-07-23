import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Gym } from './entities/gym.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { GymsService } from './gyms.service';
import { GymsController } from './gyms.controller';
import { MercadoPagoModule } from '../../common/mercadopago/mercadopago.module';

@Module({
  imports: [TypeOrmModule.forFeature([Gym, Membership]), MercadoPagoModule],
  controllers: [GymsController],
  providers: [GymsService],
  exports: [TypeOrmModule, GymsService],
})
export class GymsModule {}
