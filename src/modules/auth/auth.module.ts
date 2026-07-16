import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';
import { MailModule } from '../mail/mail.module';
import { TokenModule } from '../../common/token/token.module';
import { Role } from '../roles/entities/role.entity';

@Module({
  imports: [
    UsersModule,
    RolesModule,
    MailModule,
    TokenModule,
    TypeOrmModule.forFeature([Role]),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET no está definido');
        return {
          secret,
          signOptions: { expiresIn: config.get('JWT_EXPIRES') || '1h' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
