import * as Joi from 'joi';

// Valida process.env al arrancar la aplicación: si falta una variable
// crítica, el arranque falla de inmediato con un mensaje claro en vez de
// fallar más adelante (p. ej. dentro de la conexión de TypeORM).
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().required(),
  DATABASE_NAME: Joi.string().required(),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),

  // Provisionado en docker-compose.yml; todavía sin un módulo que lo use.
  REDIS_HOST: Joi.string().optional(),
  REDIS_PORT: Joi.number().optional(),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES: Joi.string().default('1h'),

  // Si se omite MAILTRAP_API_KEY, MailService deshabilita el envío de correos sin fallar.
  MAILTRAP_API_KEY: Joi.string().allow('').optional(),
  MAILTRAP_USE_SANDBOX: Joi.string().valid('true', 'false').optional(),
  MAILTRAP_INBOX_ID: Joi.string().allow('').optional(),
  MAILTRAP_FROM_EMAIL: Joi.string().optional(),
  MAILTRAP_FROM_NAME: Joi.string().optional(),

  FRONTEND_URL: Joi.string().uri().optional(),

  // Orígenes permitidos por CORS, separados por comas (p. ej. "http://localhost:3000,https://admin.smartbox.com").
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

  // Ya no hay variables MERCADOPAGO_* globales — el modelo Marketplace
  // dejó de usar OAuth con una Aplicación de SmartBox (exigía una empresa
  // registrada en Argentina, no viable para Ecuador) y pasó a que cada
  // gimnasio pegue su propio access token + secreto de webhook, guardados
  // en Gym.mercadoPagoAccessToken/mercadoPagoWebhookSecret. Ver
  // GymsService.connectMercadoPago / MercadoPagoService.verifyAccessToken.

  // Si se omite, Sentry.init() (src/instrument.ts) no envía nada — mismo
  // patrón que MAILTRAP_API_KEY, no hace falta cuenta de Sentry para
  // desarrollar local (E5-03).
  SENTRY_DSN: Joi.string().allow('').optional(),
}).unknown(true);
