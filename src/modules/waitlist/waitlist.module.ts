import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ClassOrResource } from '../classes/entities/class-or-resource.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { User } from '../users/user.entity';
import { WaitlistService } from './waitlist.service';
import { WaitlistController } from './waitlist.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WaitlistEntry,
      Reservation,
      ClassOrResource,
      Membership,
      User,
    ]),
    MailModule,
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService],
  exports: [TypeOrmModule, WaitlistService],
})
export class WaitlistModule {}
