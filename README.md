# SmartBox — Backend

SmartBox es un **SaaS de gestión para gimnasios**: multi-tenant, membresías con facturación recurrente, reservas de clases. El control físico de cápsulas/lockers vía IoT es la visión original del producto, pero deliberadamente la **última** release del roadmap ("SmartBox IoT"), no la primera. Este repositorio es el backend ([NestJS](https://nestjs.com/) + PostgreSQL).

📄 **Documento oficial de producto** (Functional Spec, Architecture Guide, API Contract, Backlog, Roadmap, Definition of Done, Criterios de aceptación — fuente de verdad para qué se construye y en qué orden): https://claude.ai/code/artifact/9944c8ca-31a6-4695-b6b2-c11b8e58aeb7
🤖 Ver [`CLAUDE.md`](CLAUDE.md) para las convenciones de este repo y en qué punto del roadmap estamos.

## Stack

- **Framework**: NestJS 11
- **Base de datos**: PostgreSQL (TypeORM), esquema versionado con migraciones
- **Auth**: JWT (`@nestjs/jwt` + `passport-jwt`), contraseñas con `bcrypt`
- **Rate limiting**: `@nestjs/throttler` (límite general + límites más estrictos en login/register/forgot-password/reset-password)
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

Antes del primer arranque contra una base nueva, corré las migraciones (ver [Migraciones](#migraciones) abajo) — el esquema ya no se auto-sincroniza.

Al arrancar, la aplicación:
1. Aplica un `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) a todos los endpoints.
2. Expone Swagger en `/docs` — **solo si `NODE_ENV !== production`**.
3. Siembra los roles del sistema (`SUPER_ADMIN`, `ADMIN`, `STAFF`, `CLIENT`, `DEVICE`) si no existen.
4. Siembra una cuenta `SUPER_ADMIN` de arranque (`admin@smartbox.com` / `admin123`) **solo si `NODE_ENV !== production`**. En producción este paso se omite deliberadamente — hay que crear el primer `SUPER_ADMIN` manualmente (por ejemplo con `POST /auth/register` y luego cambiando su rol directamente en base de datos, o vía un script de seed propio).

## Migraciones

El esquema se versiona con migraciones de TypeORM (`src/database/migrations/`) — `synchronize` está en `false` siempre, incluido desarrollo.

```bash
# aplicar las migraciones pendientes (correr después de npm install / al bajar cambios nuevos)
npm run migration:run

# generar una migración nueva a partir de cambios en las entidades
npm run migration:generate -- src/database/migrations/NombreDescriptivo

# deshacer la última migración aplicada
npm run migration:revert
```

`migration:generate` diffea las entidades contra el esquema real de la base a la que apunta `DATABASE_*` en `.env` — si esa base ya tiene los cambios (por ejemplo, los aplicaste a mano), el diff sale vacío. Para generar con confianza, apuntá `DATABASE_NAME` a una base vacía, generá, y después corré `migration:run` contra la base real.

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
| `CORS_ORIGINS` | Orígenes permitidos por CORS, separados por comas. Por defecto `http://localhost:3000`. |

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

Este backend cubre hoy la capa de identidad (Auth, Users, Roles), endurecida para producción: RBAC, validación global, Swagger, tests, sin deuda de seguridad conocida.

Lo que falta es el producto en sí — **SmartBox v1.0** completo requiere, en este orden:

1. **Epic 0 · Hardening pendiente** — migraciones, rate limiting, CORS configurable y el fix de roles de `request-email-change` ya resueltos; queda la decisión de infraestructura de despliegue (E0-15).
2. **Epic 1 · Fundación multi-tenant** — entidad `Gym`, cada gimnasio es un cliente aislado del SaaS.
3. **Epic 2 · Membresías y facturación recurrente** — Stripe Billing, un solo plan por gimnasio al arrancar.
4. **Epic 3 · Reservas** de clases, validadas contra membresía activa.
5. **Epic 4 · Operación del gimnasio** y **Epic 5 · Observabilidad**, que cierran v1.0.

Reservas/Pagos/IoT del documento de arquitectura original siguen sin implementar — IoT en particular es la última release del roadmap ("SmartBox IoT"), no la primera. Ver el documento oficial (arriba) para el detalle completo de cada épica, los sprints y las decisiones de alcance ya tomadas.
