import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './user.entity';
import { Role } from '../roles/entities/role.entity';
import { Gym } from '../gyms/entities/gym.entity';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MailModule } from '../mail/mail.module';
import { TokenModule } from '../../common/token/token.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Gym]),
    MailModule,
    TokenModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
