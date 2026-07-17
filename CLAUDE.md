# CLAUDE.md — smartbox-backend

Contexto operativo para trabajar en este repo. El **documento oficial de producto** (Functional Spec, Architecture Guide, API Contract, Product Backlog, Roadmap, Definition of Done, Criterios de aceptación) es la fuente de verdad si hay conflicto con este archivo:

**https://claude.ai/code/artifact/9944c8ca-31a6-4695-b6b2-c11b8e58aeb7**

## Qué es esto

Backend (NestJS + PostgreSQL) de **SmartBox**, un SaaS de gestión para gimnasios: multi-tenant, membresías con facturación recurrente, reservas. El control físico de cápsulas/lockers vía IoT (la visión original del producto) es deliberadamente la **última** release del roadmap ("SmartBox IoT"), no la primera — no lo prioricés a menos que el documento oficial diga lo contrario.

## Dónde estamos

- **Completo**: identidad (auth, usuarios, roles) y **Epic 0 · Hardening** (migraciones, rate limiting, CORS, fix de roles).
- **Completo**: **Epic 1 · Fundación multi-tenant** — entidad `Gym`, `User.gymId`, JWT con `gymId`, scoping por gimnasio en `Users`/`Admin`/`Gyms` (403, no 404, en cruces entre gimnasios), migración aplicada, tests unitarios + e2e de aislamiento.
- **Completo**: **Epic 2 · Membresías y facturación** — `E2-01` (entidades `Plan`/`Membership`), `E2-02` (integración con Mercado Pago, modelo Marketplace/OAuth), `E2-03` (webhook idempotente y con firma verificada), `E2-04` (cancelación "hasta fin de período", cron diario), `E2-05` (dunning, topic `subscription_authorized_payment`), `E2-06` (registro de facturas, entidad `Invoice`) y `E2-07` (autogestión de solo lectura, `GET /memberships/me`/`me/invoices`) completos. Gap conocido fuera del alcance de la épica: refresco automático de tokens OAuth vencidos.
- **Siguiente en el roadmap**: Epic 3 (Reservas) → Epic 4 (Operación del gimnasio) → Epic 5 (Observabilidad). Eso cierra **SmartBox v1.0**.
- Antes de arrancar una historia nueva: confirmá en qué épica/sprint del documento oficial estás parado.

## Decisiones de alcance ya tomadas para v1.0 (no las reabras sin avisar)

- Un solo plan de membresía por gimnasio al arrancar — sin niveles, descuentos ni cupones (eso es `E6-04`, diferido a v1.5).
- **Proveedor de pagos: Mercado Pago, no Stripe** (cambio de proveedor, 2026-07-17) — Stripe no permite abrir cuenta desde Ecuador (Ecuador no está en su lista de países soportados). Se evaluaron PayPal y PayPhone como alternativas; se eligió Mercado Pago por tener una API de suscripciones recurrentes (`PreApprovalPlan`/`PreApproval`) lista para usar y soporte real para Ecuador. SDK: paquete npm `mercadopago` (v3, cliente `MercadoPagoConfig`).
- **Modelo Marketplace: cada gimnasio cobra en su propia cuenta de Mercado Pago, no SmartBox** (decisión de negocio, 2026-07-17) — la plata de los socios va directo al gimnasio; SmartBox nunca la toca ni la redistribuye (evita compliance de manejo de fondos de terceros). Implementación:
  - `Gym` guarda `mercadoPagoUserId`, `mercadoPagoAccessToken`/`mercadoPagoRefreshToken` (ocultos por default, `select: false`, igual que `User.password`) y `mercadoPagoTokenExpiresAt`.
  - El ADMIN conecta su cuenta vía OAuth: `GET /gyms/:id/mercadopago/connect` devuelve la `authorizationUrl`; Mercado Pago redirige a `GET /mercadopago/oauth/callback` (público, sin JWT — la seguridad depende del `state` de un solo uso guardado en `Gym.mercadoPagoOauthState`/`...ExpiresAt`, generado con `TokenService`).
  - `PlansService`/`MembershipsService` **nunca** llaman a Mercado Pago con un token global — siempre resuelven el `access_token` del gimnasio dueño vía `GymsService.getMercadoPagoAccessToken(gymId)` y arman un cliente por-request con `MercadoPagoService.clientFor(accessToken)`. Si un gimnasio no conectó su cuenta, crear un `Plan` o suscribirse falla con 400 explícito.
  - **Sin refresh automático de tokens todavía (gap conocido)** — los access tokens de OAuth de Mercado Pago expiran; `Gym.mercadoPagoRefreshToken` ya se guarda, pero la lógica de refresco (detectar expiración, llamar `MercadoPagoService.oauth.refresh()`) no está implementada. Historia nueva antes de operar en producción con clientes reales.
- **Webhook de Mercado Pago (E2-03), implementado 2026-07-17** — `POST /memberships/webhook/mercadopago` (público, sin JWT):
  - Firma verificada con `WebhookSignatureValidator` del SDK oficial (`import { WebhookSignatureValidator } from 'mercadopago'`) contra `MERCADOPAGO_WEBHOOK_SECRET` — no reinventar el HMAC a mano, el SDK ya lo resuelve.
  - Idempotencia por `notification.id`: `INSERT` en `processed_webhook_events` (PK = id) y capturar el error de constraint única como señal de "ya procesado" — nunca "leer y después insertar" (deja una carrera entre notificaciones concurrentes).
  - El body de la notificación **nunca** es la fuente de verdad — solo dispara una consulta a la API real (`client.subscriptions.get({id: data.id})`) antes de tocar la `Membership`.
  - Maneja dos topics, distinguidos por `payload.type`: `subscription_preapproval`/`preapproval` (alta/cancelación de la suscripción, aceptados ambos de forma defensiva porque el string exacto todavía no está confirmado contra tráfico real de Mercado Pago) y `subscription_authorized_payment` (cobro recurrente/dunning, `E2-05` — ver más abajo). El topic genérico `payment` (pagos únicos, no recurrentes) se ignora a propósito.
  - Mapeo de estado (eventos `subscription_preapproval`): `authorized` sin `Membership` previa → la crea (`active`, resolviendo el `Plan` vía `external_reference` → `User.gym`, no vía un campo `preapproval_plan_id` en la respuesta porque no está confirmado que ese campo venga en el `GET`); `authorized` con `Membership` existente → actualiza `currentPeriodEnd`; `cancelled` → marca la `Membership` como `cancelled` si existía.
- **Scoping de billing (Epic 2), cerrado 2026-07-16, adaptado a Mercado Pago el 2026-07-17** — ver el detalle en el documento oficial (§00, "6b · Resultado de la sesión de scoping de billing"):
  - Trial de **14 días**: se define una sola vez en el `PreApprovalPlan` (`auto_recurring.free_trial: {frequency: 14, frequency_type: 'days'}`), no por suscripción — todo CLIENT que se suscribe al plan de un gym hereda el mismo trial.
  - Alta de membresía **únicamente self-service con tarjeta**: `POST /memberships/subscribe` crea un `PreApproval` con `status: 'pending'` (sin `card_token_id`) y devuelve el `init_point` hosted de Mercado Pago para que el socio cargue la tarjeta ahí — cero UI de pago propia. Nada de alta manual/offline por ADMIN en v1.0.
  - **Sin reembolsos automáticos ni endpoint propio** — casos excepcionales se resuelven a mano desde el panel de Mercado Pago.
  - **Cancelación "hasta fin del período pagado" (E2-04), implementado 2026-07-17** — a diferencia de Stripe, la API de Mercado Pago no tiene un flag nativo equivalente a `cancel_at_period_end` (cancelar un `PreApproval` lo corta de inmediato), así que se simula a nivel de aplicación:
    - `POST /memberships/:id/cancel` (dueño de la membresía, o `ADMIN`/`SUPER_ADMIN` del gimnasio) solo marca `Membership.cancelAtPeriodEnd=true` — no toca Mercado Pago todavía, el socio sigue con `status: 'active'`.
    - `MembershipsService.processScheduledCancellations()`, con `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)` (registrado vía `ScheduleModule.forRoot()` en `AppModule`), busca `Membership`s con `cancelAtPeriodEnd=true` y `currentPeriodEnd` vencido, y recién ahí cancela el `PreApproval` real (`client.subscriptions.update({id, body: {status: 'cancelled'}})`) y marca `status: 'cancelled'` localmente.
    - Si la cancelación remota falla, `cancelAtPeriodEnd` queda en `true` sin tocar `status` — se reintenta en el próximo barrido en vez de perder el pedido silenciosamente.
  - **Dunning (E2-04→E2-05), implementado 2026-07-17** — confirmado por documentación oficial de Mercado Pago: los cobros recurrentes reportan su resultado por el topic `subscription_authorized_payment` (distinto del `payment` genérico de pagos únicos, y distinto de `subscription_preapproval`). En `MembershipsService.handleWebhook()`, un evento de este topic consulta el `Payment` real (`client.payments.get({id: data.id})`, `MercadoPagoService.clientFor()` ahora también expone `payments: Payment`) y llama a `syncMembershipFromPayment()`:
    - `status: 'rejected'` con `Membership.status === 'active'` → pasa a `past_due` (el socio **no** pierde el acceso todavía, por la sesión de scoping de billing).
    - `status: 'approved'` con `Membership.status === 'past_due'` → vuelve a `active`.
    - Correlación pago→socio vía `payment.external_reference` contra `Membership.userId` — **asunción sin confirmar contra tráfico real todavía**: se asume que Mercado Pago copia el `external_reference` del `PreApproval` original a los `Payment`s recurrentes que genera (no hay un campo `preapproval_id`/`subscription_id` explícito en el recurso `Payment` del SDK). Verificar en sandbox/producción antes de confiar en esto para dunning de alto volumen.
    - **La cadencia/cantidad de reintentos automáticos de Mercado Pago sigue sin documentación pública** — deliberadamente no se replica acá; el sistema solo reacciona a los eventos que Mercado Pago decida mandar. Si Mercado Pago termina cancelando el `PreApproval` tras agotar sus propios reintentos, el evento `subscription_preapproval`→`cancelled` (ya manejado) se encarga de reflejarlo.
    - Sin tests contra tráfico real de Mercado Pago (solo unit tests con firma HMAC real computada a mano y un smoke test manual con firma real pero payload sintético, ya que no hay credenciales de sandbox con pagos reales todavía) — si en producción `external_reference` no llega como se asume, dunning queda silenciosamente sin efecto (no falla, pero tampoco actualiza el estado). Vigilar logs (`Logger` de `MembershipsService`) al conectar el primer gimnasio real.
  - **Registro interno de facturas (E2-06), implementado 2026-07-17** — entidad `Invoice` (tabla `invoices`, `membershipId`, `amountCents`, `status`, `mercadoPagoPaymentId` único, `paidAt`). Se puebla exclusivamente desde `MembershipsService.recordInvoice()`, llamado dentro de `syncMembershipFromPayment()` (mismo evento de webhook que dispara el dunning de `E2-05`) — nunca hay alta manual ni endpoint dedicado en v1.0, es la fuente de datos para reportes de Epic 4.
    - Upsert por `mercadoPagoPaymentId`: si ya existe una factura para ese `Payment` (Mercado Pago puede notificar el mismo pago más de una vez, p. ej. creado y luego actualizado a su estado final), se actualiza `status`/`amountCents`/`paidAt` en vez de insertar una fila nueva.
    - `amountCents` se calcula desde `payment.transaction_amount` (float) con `Math.round(x * 100)`, siguiendo la misma convención de centavos que `Plan.priceCents`. `paidAt` viene de `payment.date_approved` (`null` si el pago no fue aprobado).
    - `status` guarda el string crudo del `Payment` de Mercado Pago (no un union acotado como `Membership.status`) — es un registro pasivo, no la fuente de la transición de estado de la `Membership`.
    - Verificado en vivo contra la base de datos real: constraint `UNIQUE` en `mercadopago_payment_id` y `FOREIGN KEY` en `membership_id` (ambas probadas con inserts que fallan como se espera). El camino completo webhook→`Payment` real de Mercado Pago→`Invoice` no se pudo probar end-to-end en vivo por la misma razón que el dunning de `E2-05`: no hay credenciales de sandbox con pagos reales todavía — la lógica de `recordInvoice()` está cubierta por unit tests (upsert, conversión de monto, `paidAt`, no-op sin `payment.id`).
  - **Portal de gestión de plan/tarjeta/facturas del socio (E2-07), resuelto 2026-07-17** — investigado antes de programar, por el gap explícito que dejó la migración a Mercado Pago: no existe un endpoint tipo `stripe.billingPortal.sessions.create()` que genere un link hosted por-comercio. Lo que sí existe es la propia cuenta de Mercado Pago del socio (mercadopago.com → Tu perfil → Suscripciones/Débitos automáticos), donde ve y puede cancelar cualquier suscripción de cualquier comercio — no es algo que SmartBox integre ni pueda deep-linkear (no hay API para eso). `PUT /preapproval/{id}` sí acepta `card_token_id` para cambiar el medio de pago, pero usarlo exigiría un formulario de tarjeta propio (Brick/CardForm), lo que reabre "cero UI de pago propia" — se decidió explícitamente no hacerlo en v1.0.
    - Alcance elegido: **solo endpoints de lectura**, sin UI de pago ni link a ningún portal. `GET /memberships/me` (`CLIENT`) devuelve la membresía más reciente del solicitante (con el `Plan`); `GET /memberships/me/invoices` (`CLIENT`) devuelve su historial de `Invoice` (de todas sus membresías, no solo la vigente). Ambos scopeados implícitamente por `requester.id` — sin parámetro `:id`, no hay superficie de cruce entre socios que testear con 403.
    - Cancelar sigue siendo `POST /memberships/:id/cancel` (`E2-04`, ya existente). Cambiar de tarjeta o ver el detalle nativo de un cobro se hace desde la cuenta de Mercado Pago del socio, fuera de SmartBox — instruir al socio, no construir nada para esto.
- Alta de gimnasios nuevos es manual (SUPER_ADMIN vía API/Swagger) — el onboarding self-serve con UI es `E6-05`, diferido a v1.5.
- Infraestructura: default recomendado es un PaaS (Railway/Render/Fly.io) + Postgres gestionado, salvo que el equipo decida lo contrario.

## Stack y comandos

```bash
npm run start:dev     # dev, watch mode
npm test              # unit tests
npm run test:e2e      # e2e — algunos requieren Postgres levantado (docker compose up -d)
npm run lint          # eslint --fix
npm run build         # nest build
npx tsc --noEmit      # typecheck sin emitir
```

Swagger en `/docs` (solo fuera de producción). Ver README para variables de entorno y seeding.

## Convenciones establecidas — no las rompas sin razón

- Todo endpoint nuevo: DTO con `class-validator`, `@ApiOperation`/`@ApiProperty`, y guard explícito (`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`) o deliberadamente público con un comentario de por qué.
- `ValidationPipe` global ya tiene `whitelist` + `forbidNonWhitelisted` — un campo no declarado en el DTO se rechaza solo, no hace falta chequearlo a mano.
- Toda entidad de dominio nueva (a partir de Epic 1) lleva `gymId` (directo o heredado, p. ej. `Reservation` vía `ClassOrResource.gymId`) desde el diseño — la multi-tenancy no se agrega como parche después.
- Tokens de un solo uso (reset de contraseña, verificaciones): usar `TokenService` compartido (`src/common/token/`), no reinventar generación/expiración.
- Nada de `console.log` — `Logger` de `@nestjs/common`.
- Variable de entorno nueva → agregarla a `.env.example` **y** al schema de Joi (`src/config/env.validation.ts`); si no, el arranque no la valida.
- Commits en este repo: **sin** el trailer `Co-Authored-By`.
- Formato de mensajes de commit — [Conventional Commits](https://www.conventionalcommits.org/): `<tipo>(<alcance>): <descripción>`. Ej.: `feat(auth): add biometric login`, `fix(users): resolve pagination bug`. Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Definition of Done (aplica a toda historia, ver documento oficial §06 para el detalle completo)

- [ ] `npx tsc --noEmit` y `npm run build` sin errores
- [ ] `npm run lint` sin errores nuevos
- [ ] Tests unitarios de la lógica nueva + e2e cubriendo el caso feliz y 401/403
- [ ] Sin `any` sin justificar
- [ ] Swagger actualizado
- [ ] Si cambia el contrato de un endpoint, reflejarlo en la sección API Contract del documento oficial

## Antes de escribir código de negocio nuevo

1. Epic 2 (facturación) ya tiene su sesión de scoping de billing cerrada (ver arriba) — trial, cancelación, reembolsos y dunning están resueltos. No los reabras sin avisar; si aparece un caso no cubierto, es una historia nueva, no una reinterpretación de lo ya decidido.
2. Si la historia toca datos de más de un gimnasio, el criterio de aceptación tiene que cubrir el aislamiento (un ADMIN de un gym no debe poder ver ni inferir recursos de otro — 403, no 404).
3. Escribí el criterio de aceptación en Given/When/Then (documento oficial §07) antes de programar si todavía no existe uno para esa historia.
