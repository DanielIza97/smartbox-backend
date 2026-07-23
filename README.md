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
| `SENTRY_DSN` | DSN del proyecto de Sentry. Si se omite, `Sentry.init()` no envía nada y la app arranca igual — no hace falta cuenta de Sentry para desarrollar local. |

No hay variables `MERCADOPAGO_*` globales: cada gimnasio pega su propio access token y el secreto de su propio webhook desde la UI (`PUT /gyms/:id/mercadopago/credentials`), no por variable de entorno — ver `CLAUDE.md`.

## API

Con el servidor corriendo en modo no-producción, la documentación interactiva (Swagger) está en:

```
http://localhost:3000/docs
```

Endpoints disponibles hoy:

- **Auth** (`/auth`): `login` (incluye `gymId` en el JWT), `register` (público, rol `CLIENT`, `gymId` obligatorio), `register-internal` (solo `SUPER_ADMIN`, `gymId` obligatorio salvo para crear otro `SUPER_ADMIN`), `forgot-password`, `reset-password`, `verify-email-change`.
- **Users** (`/users`): CRUD completo protegido por rol y **scopeado por gimnasio** (incluye `DELETE /users/:id`) — `ADMIN`/`STAFF` solo ven/editan usuarios de su propio gimnasio (403, no 404, si intentan acceder a otro), `SUPER_ADMIN` sin restricción. `request-email-change` (usuario autenticado), `confirm-email-change` (público, vía token).
- **Roles** (`/roles`): listado de roles.
- **Gyms** (`/gyms`): alta y listado de gimnasios (`SUPER_ADMIN`), lectura por id (`SUPER_ADMIN`, o `ADMIN`/`STAFF` solo del propio gimnasio). `PUT /gyms/:id/mercadopago/credentials` (`SUPER_ADMIN`/`ADMIN` propio) conecta la cuenta de Mercado Pago del gimnasio — **modelo Marketplace**: la plata de los socios va directo a la cuenta del gimnasio, SmartBox no la toca. El gimnasio pega su propio access token (generado desde su propia cuenta, sin Aplicación de por medio) y el secreto de su propio webhook; el backend valida el token contra `GET /users/me` antes de guardar nada.
- **Admin** (`/admin`): resumen del sistema (usuarios totales, por rol, roles totales), restringido a `ADMIN`, scopeado al gimnasio del solicitante (`SUPER_ADMIN` ve el sistema completo).
- **Plans** (`/plans`): un solo plan mensual por gimnasio (enforced con `UNIQUE` en `gym_id`) — alta (`SUPER_ADMIN`/`ADMIN`, forzado al propio gym para `ADMIN`; crea un `PreApprovalPlan` **en la cuenta de Mercado Pago del gimnasio**, con trial de 14 días — falla con 400 si el gimnasio todavía no conectó su cuenta), listado y lectura por id scopeados por gimnasio para todos los roles autenticados (incluye `CLIENT`, para ver el plan antes de suscribirse).
- **Memberships** (`/memberships`): `POST /memberships/subscribe` (`CLIENT`) inicia una suscripción (`PreApproval` en la cuenta de Mercado Pago del gimnasio, estado `pending`) y devuelve un `checkoutUrl` hosted para cargar la tarjeta. `POST /memberships/webhook/mercadopago` (público, sin JWT) recibe las notificaciones de Mercado Pago — resuelve primero a qué gimnasio pertenece (vía `user_id`) y verifica la firma (`WebhookSignatureValidator` del SDK, header `x-signature`/`x-request-id`) contra el secreto propio de **ese** gimnasio, es idempotente por `notification.id` (tabla `processed_webhook_events`, `INSERT` con PK única), y maneja dos topics: `subscription_preapproval` (alta/cancelación de la suscripción, consulta el `PreApproval` real contra la API) y `subscription_authorized_payment` (cobro recurrente, dunning — `E2-05`, consulta el `Payment` real: `approved` reactiva una `Membership` `past_due`, `rejected` la pasa a `past_due` sin cortar el acceso; la correlación pago→socio es vía `external_reference`). Cada evento de cobro recurrente además registra/actualiza una `Invoice` (`E2-06`, tabla `invoices`, upsert por `mercadoPagoPaymentId` — sin UI de historial ni endpoint propio, es la fuente de datos para reportes de Epic 4). El topic genérico `payment` (pagos únicos, no recurrentes) se ignora a propósito. `GET /memberships/me` (`CLIENT`) devuelve la membresía propia más reciente (con el plan) y `GET /memberships/me/invoices` (`CLIENT`) el historial de facturas propio (`E2-07` — autogestión de solo lectura; Mercado Pago no tiene un Customer Portal hosted por-comercio, así que cambiar de tarjeta se hace desde la propia cuenta de Mercado Pago del socio, no desde SmartBox). `POST /memberships/:id/cancel` (dueño de la membresía, o `ADMIN`/`SUPER_ADMIN` del gimnasio) marca `cancelAtPeriodEnd=true` — el socio conserva acceso hasta `currentPeriodEnd`; un cron diario (`@nestjs/schedule`, `EVERY_DAY_AT_MIDNIGHT`) recién ahí cancela el `PreApproval` real en Mercado Pago y marca la `Membership` como `cancelled` (si la cancelación remota falla, se reintenta en el próximo barrido en vez de perder el pedido).
- **Classes** (`/classes`, Epic 3): turnos recurrentes semanales (clase/recurso) — alta (`SUPER_ADMIN`/`ADMIN`, forzado al propio gym para `ADMIN`) con `name`, `capacity`, `dayOfWeek` (0=domingo..6=sábado), `startTime` (`HH:mm`) y `durationMinutes`; una clase que se dicta varios días por semana se modela con varias filas. Listado y lectura por id scopeados por gimnasio para todos los roles autenticados. `GET /classes/:id/availability?from=&to=` (por defecto, próximos 14 días) deriva las ocurrencias reservables del patrón recurrente en el momento — sin tabla de ocurrencias materializadas — y devuelve el cupo restante de cada una (`capacity` menos reservas `confirmed`).
- **Reservations** (`/reservations`, Epic 3): `POST /reservations` (`CLIENT`) reserva un turno — valida, en orden, que la clase sea del propio gimnasio, que la membresía esté `active` (mensaje explícito si no, no un error genérico), que el `startAt` pedido corresponda a una ocurrencia real del patrón recurrente, que haya cupo, y que el socio no tenga otra reserva `confirmed` que se superponga en el tiempo. `GET /reservations` lista las propias (`CLIENT`) o las del gimnasio (`ADMIN`/`STAFF`; `SUPER_ADMIN` ve todas). `POST /reservations/:id/cancel` (dueño, o `ADMIN`/`SUPER_ADMIN` del gimnasio) marca `cancelled`. Un cron horario marca `expired` las reservas `confirmed` cuyo horario ya pasó sin cancelarse — modelo de estados simplificado (`confirmed`/`cancelled`/`expired`) sin distinción de check-in físico, que queda para Epic 8 (SmartBox IoT) cuando exista.
- **Shifts** (`/shifts`, Epic 4): horarios de trabajo recurrentes del `STAFF` (`staffId`, `dayOfWeek`, `startTime`, `endTime`), desacoplados de `ClassOrResource` a propósito — responden "qué días/horas trabaja cada empleado", no "quién dicta esta clase". Alta (`SUPER_ADMIN`/`ADMIN`) valida que el `staffId` sea un usuario `STAFF` del propio gimnasio y que no se superponga con otro turno del mismo `STAFF`. Listado y lectura por id para `SUPER_ADMIN`/`ADMIN`/`STAFF` (sin `CLIENT`, es operativo).
- **Reports** (`/reports`, Epic 4): `GET /reports/occupancy?from=&to=` (`ADMIN`/`STAFF`, por defecto últimos 7 días) — ocupación por turno de clase en el rango, derivada del patrón recurrente igual que `/classes/:id/availability`, con el promedio general. `GET /reports/revenue?from=&to=` (`ADMIN`) — ingresos por día a partir de `Invoice` `approved` en el rango, más el conteo actual de socios con `Membership` `active`. `SUPER_ADMIN` debe pasar `gymId` explícito por query param (un reporte es inherentemente de un gimnasio, no tiene sentido agregar todos mezclados).
- **Health** (`/health`, Epic 5): pública, sin JWT (la consumen balanceadores/monitores de uptime, no clientes de la API) — chequea Postgres vía `@nestjs/terminus`. Redis y MQTT no se chequean todavía: no tienen ningún módulo que los use en el código.
- **Metrics** (`/metrics`, Epic 5): pública, sin JWT, excluida de Swagger — formato Prometheus (`prom-client`), la scrapea Prometheus, no un cliente de la API. Expone las métricas default del proceso Node más `http_request_duration_seconds` (labels `method`/`route`/`status_code`), alimentada por el mismo middleware que hace el logging estructurado.

Transversal a toda la API (Epic 5): cada request lleva un `x-request-id` (el del header entrante si vino, si no uno generado) devuelto en la respuesta y disponible en cualquier capa vía `AsyncLocalStorage`; al terminar la respuesta se loguea una línea JSON estructurada (`requestId`, `method`, `path`, `statusCode`, `durationMs`). Las excepciones no controladas (no las esperadas como `NotFoundException`/`BadRequestException`, esas siguen devolviendo su JSON normal) se reportan a Sentry si `SENTRY_DSN` está configurado.

## Tests

```bash
npm run test        # unit tests
npm run test:e2e    # e2e (incluye pruebas que requieren Postgres levantado)
npm run test:cov    # cobertura
```

Los tests en `test/protected-routes.e2e-spec.ts` (y el resto de `test/*.e2e-spec.ts`) verifican los guards (401/403/200 por rol) contra `TestingModule`s aislados por controller, sin depender de base de datos. Ninguno bootea el `AppModule` completo con Postgres real todavía — el wiring global (middleware de logging, filtro de Sentry, health check) se verifica manualmente contra `npm run start:dev` (ver `CLAUDE.md`, Epic 5).

## Estado del proyecto

Este backend cubre hoy la capa de identidad (Auth, Users, Roles), endurecida para producción: RBAC, validación global, Swagger, tests, sin deuda de seguridad conocida.

Lo que falta es el producto en sí — **SmartBox v1.0** completo requiere, en este orden:

1. **Epic 0 · Hardening** — resuelto: migraciones, rate limiting, CORS configurable y el fix de roles de `request-email-change`. Queda la decisión de infraestructura de despliegue (E0-15).
2. **Epic 1 · Fundación multi-tenant** — resuelto: entidad `Gym`, `User.gymId`, scoping por gimnasio en `Users`/`Admin`, aislamiento 403 verificado con tests unitarios y e2e.
3. **Epic 2 · Membresías y facturación recurrente** — resuelto. Sesión de scoping de billing cerrada; `E2-01` resuelto (entidades `Plan`/`Membership`, un plan por gimnasio); `E2-02` resuelto (integración con **Mercado Pago**, modelo **Marketplace** — cada gimnasio conecta y cobra en su propia cuenta, pegando su propio access token; Stripe no soporta cuentas en Ecuador, de ahí el cambio de proveedor); `E2-03` resuelto (webhook idempotente y con verificación de firma para el topic `subscription_preapproval`); `E2-04` resuelto (cancelación "hasta fin de período" simulada a nivel de aplicación con un cron diario, ver `CLAUDE.md`); `E2-05` resuelto (dunning — el webhook ahora también maneja el topic `subscription_authorized_payment`, reactivando/marcando `past_due` la `Membership` según el resultado del cobro recurrente; la cadencia de reintentos de Mercado Pago no está documentada públicamente y no se replica, ver `CLAUDE.md`); `E2-06` resuelto (registro interno de facturas — entidad `Invoice`, poblada como upsert desde cada evento de cobro recurrente, sin UI de historial ni endpoint propio); `E2-07` resuelto (autogestión de solo lectura — `GET /memberships/me` y `GET /memberships/me/invoices`; Mercado Pago no tiene un Customer Portal hosted por-comercio como Stripe, así que cambiar de tarjeta o cancelar se hace desde la propia cuenta de Mercado Pago del socio o con `POST /memberships/:id/cancel` ya existente, ver `CLAUDE.md`). Queda pendiente, fuera de Epic 2, el refresco automático de tokens OAuth vencidos.
4. **Epic 3 · Reservas** — resuelto. `E3-01` resuelto (entidades `ClassOrResource`/`Reservation` — turnos recurrentes semanales, ver "Modelo de horarios" en `CLAUDE.md`); `E3-02` resuelto (`GET /classes/:id/availability`, ocurrencias derivadas del patrón recurrente en el momento, sin materializar); `E3-03` resuelto (`POST /reservations`, valida membresía activa, ocurrencia válida, cupo y solapamiento); `E3-04` resuelto (`POST /reservations/:id/cancel` y cron horario de expiración). `E3-05` (frontend) queda fuera de este repo.
5. **Epic 4 · Operación del gimnasio** — resuelto. `E4-01` resuelto sin trabajo adicional (el catálogo de clases ya lo cubrió `E3-01`/`E3-02`); `E4-02` resuelto (entidad `Shift`, horarios de trabajo del `STAFF` desacoplados de las clases, ver sesión de scoping en `CLAUDE.md`); `E4-03` resuelto (`GET /reports/occupancy` y `GET /reports/revenue`, con rango de fechas y series por día); `E4-04` no necesitó endpoint nuevo — cargar clases/turnos iniciales al dar de alta un gym se cubre con `POST /classes` y `POST /shifts` ya existentes (alta de gimnasios ya es manual, ver más abajo). De paso se corrigió un bug real de timezone (ver `CLAUDE.md`) que afectaba `Invoice.paidAt`, `Membership.currentPeriodEnd`/`trialEndsAt` y `Reservation.startAt`/`endAt`.
6. **Epic 5 · Observabilidad** — resuelto. `E5-01` resuelto (`GET /health` con `@nestjs/terminus`, chequea Postgres — Redis/MQTT quedan afuera porque no tienen ningún módulo que los use todavía); `E5-02` resuelto (correlation id por request vía `AsyncLocalStorage`, log estructurado con `requestId`/`method`/`path`/`statusCode`/`durationMs` al terminar cada response); `E5-03` resuelto (`@sentry/nestjs`, `SENTRY_DSN` opcional, mismo patrón que Mailtrap — sin filtro global previo, `SentryGlobalFilter` es el único); `E5-04` acotado a exponer `GET /metrics` en formato Prometheus (`prom-client`) — los dashboards en sí viven en Grafana, una herramienta externa sin desplegar todavía (la decisión de infraestructura `E0-15` sigue abierta), ver `CLAUDE.md`.

**SmartBox v1.0 completo.** Pagos/Reservas/Operación del gimnasio/Observabilidad del documento de arquitectura original ya están implementados (Epics 2-5) — IoT en particular es la última release del roadmap ("SmartBox IoT"), no la primera. Ver el documento oficial (arriba) para el detalle completo de cada épica, los sprints y las decisiones de alcance ya tomadas.
