import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClassOrResource } from './entities/class-or-resource.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { Location } from '../locations/entities/location.entity';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClassOrResource, Reservation, Gym, Location]),
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [TypeOrmModule, ClassesService],
})
export class ClassesModule {}
