# CLAUDE.md — smartbox-backend

Contexto operativo para trabajar en este repo. El **documento oficial de producto** (Functional Spec, Architecture Guide, API Contract, Product Backlog, Roadmap, Definition of Done, Criterios de aceptación) es la fuente de verdad si hay conflicto con este archivo:

**https://claude.ai/code/artifact/9944c8ca-31a6-4695-b6b2-c11b8e58aeb7**

## Qué es esto

Backend (NestJS + PostgreSQL) de **SmartBox**, un SaaS de gestión para gimnasios: multi-tenant, membresías con facturación recurrente, reservas. El control físico de cápsulas/lockers vía IoT (la visión original del producto) es deliberadamente la **última** release del roadmap ("SmartBox IoT"), no la primera — no lo prioricés a menos que el documento oficial diga lo contrario.

## Dónde estamos

- **Completo**: identidad (auth, usuarios, roles) y **Epic 0 · Hardening** (migraciones, rate limiting, CORS, fix de roles).
- **Completo**: **Epic 1 · Fundación multi-tenant** — entidad `Gym`, `User.gymId`, JWT con `gymId`, scoping por gimnasio en `Users`/`Admin`/`Gyms` (403, no 404, en cruces entre gimnasios), migración aplicada, tests unitarios + e2e de aislamiento.
- **Siguiente en el roadmap**: Epic 2 (Membresías y facturación) → Epic 3 (Reservas) → Epic 4 (Operación del gimnasio) → Epic 5 (Observabilidad). Eso cierra **SmartBox v1.0**.
- Antes de arrancar una historia nueva: confirmá en qué épica/sprint del documento oficial estás parado. Epic 2 requiere la sesión de scoping de billing (ver más abajo) antes de programar.

## Decisiones de alcance ya tomadas para v1.0 (no las reabras sin avisar)

- Un solo plan de membresía por gimnasio al arrancar — sin niveles, descuentos ni cupones (eso es `E6-04`, diferido a v1.5).
- **Proveedor de pagos: Mercado Pago, no Stripe** (cambio de proveedor, 2026-07-17) — Stripe no permite abrir cuenta desde Ecuador (Ecuador no está en su lista de países soportados). Se evaluaron PayPal y PayPhone como alternativas; se eligió Mercado Pago por tener una API de suscripciones recurrentes (`PreApprovalPlan`/`PreApproval`) lista para usar y soporte real para Ecuador. SDK: paquete npm `mercadopago` (v3, cliente `MercadoPagoConfig`).
- **Modelo Marketplace: cada gimnasio cobra en su propia cuenta de Mercado Pago, no SmartBox** (decisión de negocio, 2026-07-17) — la plata de los socios va directo al gimnasio; SmartBox nunca la toca ni la redistribuye (evita compliance de manejo de fondos de terceros). Implementación:
  - `Gym` guarda `mercadoPagoUserId`, `mercadoPagoAccessToken`/`mercadoPagoRefreshToken` (ocultos por default, `select: false`, igual que `User.password`) y `mercadoPagoTokenExpiresAt`.
  - El ADMIN conecta su cuenta vía OAuth: `GET /gyms/:id/mercadopago/connect` devuelve la `authorizationUrl`; Mercado Pago redirige a `GET /mercadopago/oauth/callback` (público, sin JWT — la seguridad depende del `state` de un solo uso guardado en `Gym.mercadoPagoOauthState`/`...ExpiresAt`, generado con `TokenService`).
  - `PlansService`/`MembershipsService` **nunca** llaman a Mercado Pago con un token global — siempre resuelven el `access_token` del gimnasio dueño vía `GymsService.getMercadoPagoAccessToken(gymId)` y arman un cliente por-request con `MercadoPagoService.clientFor(accessToken)`. Si un gimnasio no conectó su cuenta, crear un `Plan` o suscribirse falla con 400 explícito.
  - **Sin refresh automático de tokens todavía (gap conocido)** — los access tokens de OAuth de Mercado Pago expiran; `Gym.mercadoPagoRefreshToken` ya se guarda, pero la lógica de refresco (detectar expiración, llamar `MercadoPagoService.oauth.refresh()`) no está implementada. Historia nueva antes de operar en producción con clientes reales.
- **Scoping de billing (Epic 2), cerrado 2026-07-16, adaptado a Mercado Pago el 2026-07-17** — ver el detalle en el documento oficial (§00, "6b · Resultado de la sesión de scoping de billing"):
  - Trial de **14 días**: se define una sola vez en el `PreApprovalPlan` (`auto_recurring.free_trial: {frequency: 14, frequency_type: 'days'}`), no por suscripción — todo CLIENT que se suscribe al plan de un gym hereda el mismo trial.
  - Alta de membresía **únicamente self-service con tarjeta**: `POST /memberships/subscribe` crea un `PreApproval` con `status: 'pending'` (sin `card_token_id`) y devuelve el `init_point` hosted de Mercado Pago para que el socio cargue la tarjeta ahí — cero UI de pago propia. Nada de alta manual/offline por ADMIN en v1.0.
  - **Sin reembolsos automáticos ni endpoint propio** — casos excepcionales se resuelven a mano desde el panel de Mercado Pago.
  - **Cancelación "hasta fin del período pagado" — todavía sin resolver a nivel de implementación (pendiente para E2-04)**: a diferencia de Stripe, la API de Mercado Pago no tiene un flag nativo equivalente a `cancel_at_period_end` — cancelar un `PreApproval` lo corta de inmediato. Para lograr el comportamiento ya decidido (el socio conserva acceso hasta `currentPeriodEnd`), `E2-04` va a necesitar simularlo a nivel de aplicación: marcar `Membership.cancelAtPeriodEnd=true` al pedido de cancelación y recién llamar a la cancelación real en Mercado Pago cuando venza el período. No lo des por resuelto solo porque el campo ya existe en la entidad.
  - **Dunning — todavía sin verificar cómo lo maneja Mercado Pago (pendiente para E2-03/E2-05)**: Stripe tiene "Smart Retries" documentado; Mercado Pago maneja los reintentos de cobro recurrente distinto (vía el ciclo de vida de `payment`, no de `preapproval`). Investigar el comportamiento real antes de implementar E2-05, no asumir paridad con el diseño pensado para Stripe.
  - **Portal de gestión de plan/tarjeta/facturas del socio — decisión abierta, no resuelta (afecta `E2-07`)**: la Recomendación 2 original asumía el Stripe Customer Portal (hosted). Mercado Pago no tiene un equivalente hosted idéntico para que el socio autogestione una suscripción específica de un merchant — resolver esto explícitamente antes de programar `E2-07`, no asumir que "linkear a un portal" sigue siendo la solución.
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
