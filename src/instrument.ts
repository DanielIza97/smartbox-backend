// Se importa como la primera línea de main.ts, antes que cualquier otro
// módulo — Sentry necesita instrumentar el resto de la app antes de que se
// cargue (ver docs de @sentry/nestjs). No pasa por el ConfigModule de Nest
// (todavía no existe en este punto del arranque), lee process.env directo
// igual que src/database/data-source.ts.
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

// Sin SENTRY_DSN, el SDK no envía nada — mismo patrón que MAILTRAP_API_KEY
// (ver env.validation.ts): la integración queda deshabilitada sin fallar
// el arranque, no hace falta una cuenta de Sentry para desarrollar local.
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
