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

  // Credenciales de la app de Mercado Pago (modelo Marketplace/OAuth: cada
  // gimnasio conecta su propia cuenta, ver Gym.mercadoPago*). ACCESS_TOKEN
  // es el token propio de la app de SmartBox, requerido por el SDK para
  // instanciar el cliente de OAuth aunque la autenticación real del
  // intercambio de código vaya por client_id/client_secret en el body.
  MERCADOPAGO_ACCESS_TOKEN: Joi.string().required(),
  MERCADOPAGO_CLIENT_ID: Joi.string().required(),
  MERCADOPAGO_CLIENT_SECRET: Joi.string().required(),
  MERCADOPAGO_REDIRECT_URI: Joi.string().uri().required(),
}).unknown(true);
