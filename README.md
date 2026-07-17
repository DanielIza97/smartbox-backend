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
| `MERCADOPAGO_ACCESS_TOKEN` | Access token propio de la **app** de SmartBox (no de ningún gimnasio) — lo pide el SDK para instanciar el cliente de OAuth. Obligatorio. |
| `MERCADOPAGO_CLIENT_ID` / `MERCADOPAGO_CLIENT_SECRET` | Credenciales de la app de Mercado Pago, usadas en el handshake OAuth con el que cada gimnasio conecta su propia cuenta (modelo Marketplace). Obligatorias. |
| `MERCADOPAGO_REDIRECT_URI` | URL de callback registrada en la app de Mercado Pago (`GET /mercadopago/oauth/callback`). Obligatoria. |
| `MERCADOPAGO_WEBHOOK_SECRET` | "Secret signature" de la app (Tus Integraciones → Webhooks) — verifica la firma de `POST /memberships/webhook/mercadopago`. Obligatoria. |

## API

Con el servidor corriendo en modo no-producción, la documentación interactiva (Swagger) está en:

```
http://localhost:3000/docs
```

Endpoints disponibles hoy:

- **Auth** (`/auth`): `login` (incluye `gymId` en el JWT), `register` (público, rol `CLIENT`, `gymId` obligatorio), `register-internal` (solo `SUPER_ADMIN`, `gymId` obligatorio salvo para crear otro `SUPER_ADMIN`), `forgot-password`, `reset-password`, `verify-email-change`.
- **Users** (`/users`): CRUD completo protegido por rol y **scopeado por gimnasio** (incluye `DELETE /users/:id`) — `ADMIN`/`STAFF` solo ven/editan usuarios de su propio gimnasio (403, no 404, si intentan acceder a otro), `SUPER_ADMIN` sin restricción. `request-email-change` (usuario autenticado), `confirm-email-change` (público, vía token).
- **Roles** (`/roles`): listado de roles.
- **Gyms** (`/gyms`): alta y listado de gimnasios (`SUPER_ADMIN`), lectura por id (`SUPER_ADMIN`, o `ADMIN`/`STAFF` solo del propio gimnasio). `GET /gyms/:id/mercadopago/connect` (`SUPER_ADMIN`/`ADMIN` propio) inicia el handshake OAuth para que el gimnasio conecte su propia cuenta de Mercado Pago — **modelo Marketplace**: la plata de los socios va directo a la cuenta del gimnasio, SmartBox no la toca. `GET /mercadopago/oauth/callback` es el redirect público al que llama Mercado Pago (sin JWT, protegido por un `state` de un solo uso).
- **Admin** (`/admin`): resumen del sistema (usuarios totales, por rol, roles totales), restringido a `ADMIN`, scopeado al gimnasio del solicitante (`SUPER_ADMIN` ve el sistema completo).
- **Plans** (`/plans`): un solo plan mensual por gimnasio (enforced con `UNIQUE` en `gym_id`) — alta (`SUPER_ADMIN`/`ADMIN`, forzado al propio gym para `ADMIN`; crea un `PreApprovalPlan` **en la cuenta de Mercado Pago del gimnasio**, con trial de 14 días — falla con 400 si el gimnasio todavía no conectó su cuenta), listado y lectura por id scopeados por gimnasio para todos los roles autenticados (incluye `CLIENT`, para ver el plan antes de suscribirse).
- **Memberships** (`/memberships`): `POST /memberships/subscribe` (`CLIENT`) inicia una suscripción (`PreApproval` en la cuenta de Mercado Pago del gimnasio, estado `pending`) y devuelve un `checkoutUrl` hosted para cargar la tarjeta. `POST /memberships/webhook/mercadopago` (público, sin JWT) recibe las notificaciones de Mercado Pago — verifica la firma (`WebhookSignatureValidator` del SDK, header `x-signature`/`x-request-id` contra `MERCADOPAGO_WEBHOOK_SECRET`), es idempotente por `notification.id` (tabla `processed_webhook_events`, `INSERT` con PK única), y maneja dos topics: `subscription_preapproval` (alta/cancelación de la suscripción, consulta el `PreApproval` real contra la API) y `subscription_authorized_payment` (cobro recurrente, dunning — `E2-05`, consulta el `Payment` real: `approved` reactiva una `Membership` `past_due`, `rejected` la pasa a `past_due` sin cortar el acceso; la correlación pago→socio es vía `external_reference`). El topic genérico `payment` (pagos únicos, no recurrentes) se ignora a propósito. `POST /memberships/:id/cancel` (dueño de la membresía, o `ADMIN`/`SUPER_ADMIN` del gimnasio) marca `cancelAtPeriodEnd=true` — el socio conserva acceso hasta `currentPeriodEnd`; un cron diario (`@nestjs/schedule`, `EVERY_DAY_AT_MIDNIGHT`) recién ahí cancela el `PreApproval` real en Mercado Pago y marca la `Membership` como `cancelled` (si la cancelación remota falla, se reintenta en el próximo barrido en vez de perder el pedido).

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

1. **Epic 0 · Hardening** — resuelto: migraciones, rate limiting, CORS configurable y el fix de roles de `request-email-change`. Queda la decisión de infraestructura de despliegue (E0-15).
2. **Epic 1 · Fundación multi-tenant** — resuelto: entidad `Gym`, `User.gymId`, scoping por gimnasio en `Users`/`Admin`, aislamiento 403 verificado con tests unitarios y e2e.
3. **Epic 2 · Membresías y facturación recurrente** — en progreso. Sesión de scoping de billing cerrada; `E2-01` resuelto (entidades `Plan`/`Membership`, un plan por gimnasio); `E2-02` resuelto (integración con **Mercado Pago**, modelo **Marketplace** — cada gimnasio conecta y cobra en su propia cuenta vía OAuth; Stripe no soporta cuentas en Ecuador, de ahí el cambio de proveedor); `E2-03` resuelto (webhook idempotente y con verificación de firma para el topic `subscription_preapproval`); `E2-04` resuelto (cancelación "hasta fin de período" simulada a nivel de aplicación con un cron diario, ver `CLAUDE.md`); `E2-05` resuelto (dunning — el webhook ahora también maneja el topic `subscription_authorized_payment`, reactivando/marcando `past_due` la `Membership` según el resultado del cobro recurrente; la cadencia de reintentos de Mercado Pago no está documentada públicamente y no se replica, ver `CLAUDE.md`). Falta `E2-06` (registro de facturas), `E2-07` (gestión de plan/tarjeta sin UI propia) y el refresco automático de tokens OAuth vencidos.
4. **Epic 3 · Reservas** de clases, validadas contra membresía activa.
5. **Epic 4 · Operación del gimnasio** y **Epic 5 · Observabilidad**, que cierran v1.0.

Reservas/Pagos/IoT del documento de arquitectura original siguen sin implementar — IoT en particular es la última release del roadmap ("SmartBox IoT"), no la primera. Ver el documento oficial (arriba) para el detalle completo de cada épica, los sprints y las decisiones de alcance ya tomadas.
