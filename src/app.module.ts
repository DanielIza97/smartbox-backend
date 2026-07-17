import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';

import { DatabaseModule } from './database/database.module';
import { envValidationSchema } from './config/env.validation';
import { ObservabilityModule } from './common/observability/observability.module';
import { LoggingMiddleware } from './common/observability/logging.middleware';

// módulos
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { AdminModule } from './modules/admin/admin.module';
import { GymsModule } from './modules/gyms/gyms.module';
import { PlansModule } from './modules/plans/plans.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { ClassesModule } from './modules/classes/classes.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // ENV GLOBAL
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    // Rate limiting: límite general por defecto; los endpoints sensibles
    // (login, forgot-password, register) se acotan más con @Throttle().
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    // Cron para tareas programadas (barrido de cancelaciones al vencer el
    // período — E2-04, ver MembershipsService).
    ScheduleModule.forRoot(),

    // Reporta excepciones no controladas a Sentry (E5-03) — sin
    // SENTRY_DSN, Sentry.init() en src/instrument.ts no envía nada.
    SentryModule.forRoot(),

    // DB
    DatabaseModule,

    // Observabilidad (E5-02/E5-04): MetricsService + GET /metrics.
    ObservabilityModule,
    HealthModule,

    // BUSINESS MODULES
    AuthModule,
    UsersModule,
    RolesModule,
    AdminModule,
    GymsModule,
    PlansModule,
    MembershipsModule,
    ClassesModule,
    ReservationsModule,
    ShiftsModule,
    ReportsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Único filtro global (E5-03) — no había ningún exception filter
    // previo en la app, así que SentryGlobalFilter puede encargarse tanto
    // de reportar a Sentry como de la respuesta HTTP estándar (extiende
    // BaseExceptionFilter de Nest).
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
