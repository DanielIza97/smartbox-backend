import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

import { seedRoles } from './database/seed-roles';
import { seedAdmin } from './database/seed-admin';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS (IMPORTANTE para Next.js)
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  // Swagger solo fuera de producción: evita exponer el mapa completo de la API públicamente.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SmartBox API')
      .setDescription('API del backend de SmartBox (auth, usuarios, roles)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const dataSource = app.get(DataSource);

  // seeds iniciales
  await seedRoles(dataSource);

  if (process.env.NODE_ENV === 'production') {
    logger.warn(
      'Seed de administrador por defecto omitido en producción. Crea el primer SUPER_ADMIN manualmente.',
    );
  } else {
    await seedAdmin(dataSource);
  }

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Error fatal durante el arranque', error);
  process.exit(1);
});
