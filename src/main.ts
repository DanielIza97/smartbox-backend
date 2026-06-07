import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

import { seedRoles } from './database/seed-roles';
import { seedAdmin } from './database/seed-admin';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const dataSource = app.get(DataSource);

  // 🔥 seeds iniciales
  await seedRoles(dataSource);
  await seedAdmin(dataSource);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();