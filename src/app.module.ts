import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from './database/database.module';

// módulos
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // ENV GLOBAL
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // DB
    DatabaseModule,

    // BUSINESS MODULES
    AuthModule,
    UsersModule,
    RolesModule,
    AdminModule,
  ],
})
export class AppModule {}