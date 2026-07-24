import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CheckIn } from './entities/check-in.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { User } from '../users/user.entity';
import { Location } from '../locations/entities/location.entity';
import { CheckInsService } from './checkins.service';
import { CheckInsController } from './checkins.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CheckIn, Reservation, User, Location])],
  controllers: [CheckInsController],
  providers: [CheckInsService],
  exports: [TypeOrmModule, CheckInsService],
})
export class CheckInsModule {}
