# SmartBox — Backend

Backend del ecosistema SmartBox: una plataforma fitness automatizada (cápsulas de entrenamiento con acceso por reserva, control IoT vía ESP32 y pagos digitales). Este repositorio implementa por ahora la capa de identidad — autenticación, usuarios y roles — sobre [NestJS](https://nestjs.com/) y PostgreSQL.

## Stack

- **Framework**: NestJS 11
- **Base de datos**: PostgreSQL (TypeORM)
- **Auth**: JWT (`@nestjs/jwt` + `passport-jwt`), contraseñas con `bcrypt`
- **Correo**: Mailtrap (recuperación de contraseña, verificación de cambio de email)
- **Infra local**: Docker Compose (Postgres + Redis — Redis está provisionado pero aún sin un módulo que lo use)

## Puesta en marcha

```bash
npm install

# copia el archivo de variables de entorno y completa los valores reales
cp .env.example .env

# levanta Postgres y Redis en local
docker compose up -d

# modo desarrollo (watch)
npm run start:dev
```

Al arrancar, la aplicación:
1. Aplica un `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) a todos los endpoints.
2. Expone Swagger en `/docs` — **solo si `NODE_ENV !== production`**.
3. Siembra los roles del sistema (`SUPER_ADMIN`, `ADMIN`, `STAFF`, `CLIENT`, `DEVICE`) si no existen.
4. Siembra una cuenta `SUPER_ADMIN` de arranque (`admin@smartbox.com` / `admin123`) **solo si `NODE_ENV !== production`**. En producción este paso se omite deliberadamente — hay que crear el primer `SUPER_ADMIN` manualmente (por ejemplo con `POST /auth/register` y luego cambiando su rol directamente en base de datos, o vía un script de seed propio).

## Variables de entorno

Ver [`.env.example`](.env.example) para la lista completa con comentarios. Resumen:

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto HTTP del servidor. |
| `NODE_ENV` | `development` \| `production`. Controla el seed de admin y si Swagger se expone. |
| `DATABASE_HOST/PORT/NAME/USER/PASSWORD` | Conexión a PostgreSQL. |
| `REDIS_HOST/PORT` | Conexión a Redis (provisionado, aún no integrado en el código). |
| `JWT_SECRET` | Secreto para firmar los access tokens. Obligatorio — el arranque falla sin él. |
| `JWT_EXPIRES` | Expiración del access token (por defecto `1h`). |
| `MAILTRAP_API_KEY` | Token de Mailtrap. Si se omite, el envío de correos queda deshabilitado sin romper el arranque. |
| `MAILTRAP_USE_SANDBOX` / `MAILTRAP_INBOX_ID` | Modo sandbox de Mailtrap para desarrollo. |
| `MAILTRAP_FROM_EMAIL` / `MAILTRAP_FROM_NAME` | Remitente de los correos. |
| `FRONTEND_URL` | Base usada para armar los enlaces de los correos (reset de contraseña, verificación de cambio de email). |

## API

Con el servidor corriendo en modo no-producción, la documentación interactiva (Swagger) está en:

```
http://localhost:3000/docs
```

Endpoints disponibles hoy:

- **Auth** (`/auth`): `login`, `register` (público, rol `CLIENT`), `register-internal` (solo `SUPER_ADMIN`), `forgot-password`, `reset-password`, `verify-email-change`.
- **Users** (`/users`): CRUD completo protegido por rol (incluye `DELETE /users/:id`), `request-email-change` (usuario autenticado), `confirm-email-change` (público, vía token).
- **Roles** (`/roles`): listado de roles.
- **Admin** (`/admin`): resumen del sistema (usuarios totales, por rol, roles totales), restringido a `ADMIN`.

## Tests

```bash
npm run test        # unit tests
npm run test:e2e    # e2e (incluye pruebas que requieren Postgres levantado)
npm run test:cov    # cobertura
```

Los tests en `test/protected-routes.e2e-spec.ts` verifican los guards (401/403/200 por rol) sin depender de base de datos. `test/app.e2e-spec.ts` sí requiere una conexión real a Postgres (`docker compose up -d` primero).

## Estado del proyecto

Este backend cubre la capa de identidad (Auth, Users, Roles). Los módulos de negocio descritos en la arquitectura general de SmartBox — Reservas, Pagos, IoT/MQTT — todavía no están implementados.
