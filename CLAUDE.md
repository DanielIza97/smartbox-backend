# CLAUDE.md — smartbox-backend

Contexto operativo para trabajar en este repo. El **documento oficial de producto** (Functional Spec, Architecture Guide, API Contract, Product Backlog, Roadmap, Definition of Done, Criterios de aceptación) es la fuente de verdad si hay conflicto con este archivo:

**https://claude.ai/code/artifact/9944c8ca-31a6-4695-b6b2-c11b8e58aeb7**

## Qué es esto

Backend (NestJS + PostgreSQL) de **SmartBox**, un SaaS de gestión para gimnasios: multi-tenant, membresías con facturación recurrente, reservas. El control físico de cápsulas/lockers vía IoT (la visión original del producto) es deliberadamente la **última** release del roadmap ("SmartBox IoT"), no la primera — no lo prioricés a menos que el documento oficial diga lo contrario.

## Dónde estamos

- **Completo y endurecido**: identidad — auth, usuarios, roles (ver README para el detalle de endpoints).
- **Siguiente en el roadmap**: Sprint 0 (Epic 0 · Hardening pendiente) → Sprint 1 (Epic 1 · Fundación multi-tenant) → Epic 2 (Membresías y facturación) → Epic 3 (Reservas) → Epic 4 (Operación del gimnasio) → Epic 5 (Observabilidad). Eso cierra **SmartBox v1.0**.
- Antes de arrancar una historia nueva: confirmá en qué épica/sprint del documento oficial estás parado. No implementes Epic 2+ sin haber cerrado Epic 1 (todo lo nuevo depende de que exista `gymId`).

## Decisiones de alcance ya tomadas para v1.0 (no las reabras sin avisar)

- Un solo plan de membresía por gimnasio al arrancar — sin niveles, descuentos ni cupones (eso es `E6-04`, diferido a v1.5).
- Gestión de plan/tarjeta/facturas del socio vía **Stripe Customer Portal** (hosted) — no construir esa UI a mano en v1.0.
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

## Definition of Done (aplica a toda historia, ver documento oficial §06 para el detalle completo)

- [ ] `npx tsc --noEmit` y `npm run build` sin errores
- [ ] `npm run lint` sin errores nuevos
- [ ] Tests unitarios de la lógica nueva + e2e cubriendo el caso feliz y 401/403
- [ ] Sin `any` sin justificar
- [ ] Swagger actualizado
- [ ] Si cambia el contrato de un endpoint, reflejarlo en la sección API Contract del documento oficial

## Antes de escribir código de negocio nuevo

1. Si la historia toca Epic 2 (facturación) — hacé/confirmá la sesión de scoping de billing antes de programar (período de prueba, cambio de plan a mitad de mes, reembolsos). Es un gate explícito en el Roadmap, no un detalle a resolver sobre la marcha.
2. Si la historia toca datos de más de un gimnasio, el criterio de aceptación tiene que cubrir el aislamiento (un ADMIN de un gym no debe poder ver ni inferir recursos de otro — 403, no 404).
3. Escribí el criterio de aceptación en Given/When/Then (documento oficial §07) antes de programar si todavía no existe uno para esa historia.
