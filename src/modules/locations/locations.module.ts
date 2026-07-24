import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Location } from './entities/location.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Location, Gym])],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [TypeOrmModule, LocationsService],
})
export class LocationsModule {}
