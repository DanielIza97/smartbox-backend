import { envValidationSchema } from './env.validation';

interface ValidatedEnv {
  NODE_ENV: string;
  PORT: number;
  JWT_EXPIRES: string;
  DATABASE_PORT: number;
  CORS_ORIGINS: string;
}

describe('envValidationSchema', () => {
  const validEnv: Record<string, string> = {
    DATABASE_HOST: 'localhost',
    DATABASE_PORT: '5432',
    DATABASE_NAME: 'smartbox',
    DATABASE_USER: 'smartbox',
    DATABASE_PASSWORD: 'secret',
    JWT_SECRET: 'a-long-enough-secret-value',
    MERCADOPAGO_ACCESS_TOKEN: 'TEST-xxx',
    MERCADOPAGO_CLIENT_ID: 'client-id',
    MERCADOPAGO_CLIENT_SECRET: 'client-secret',
    MERCADOPAGO_REDIRECT_URI:
      'http://localhost:3001/mercadopago/oauth/callback',
    MERCADOPAGO_WEBHOOK_SECRET: 'webhook-secret',
  };

  const withoutKey = (key: string): Record<string, string> => {
    const copy = { ...validEnv };
    delete copy[key];
    return copy;
  };

  it('pasa con las variables mínimas requeridas y aplica los defaults', () => {
    const { error, value } = envValidationSchema.validate(validEnv, {
      abortEarly: false,
    }) as { error?: Error; value: ValidatedEnv };

    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(3000);
    expect(value.JWT_EXPIRES).toBe('1h');
    expect(value.DATABASE_PORT).toBe(5432);
    expect(value.CORS_ORIGINS).toBe('http://localhost:3000');
  });

  it('falla si falta DATABASE_HOST', () => {
    const { error } = envValidationSchema.validate(
      withoutKey('DATABASE_HOST'),
      {
        abortEarly: false,
      },
    );

    expect(error?.message).toContain('DATABASE_HOST');
  });

  it('falla si falta JWT_SECRET', () => {
    const { error } = envValidationSchema.validate(withoutKey('JWT_SECRET'), {
      abortEarly: false,
    });

    expect(error?.message).toContain('JWT_SECRET');
  });

  it('falla si falta MERCADOPAGO_ACCESS_TOKEN', () => {
    const { error } = envValidationSchema.validate(
      withoutKey('MERCADOPAGO_ACCESS_TOKEN'),
      { abortEarly: false },
    );

    expect(error?.message).toContain('MERCADOPAGO_ACCESS_TOKEN');
  });

  it('falla si falta MERCADOPAGO_CLIENT_ID', () => {
    const { error } = envValidationSchema.validate(
      withoutKey('MERCADOPAGO_CLIENT_ID'),
      { abortEarly: false },
    );

    expect(error?.message).toContain('MERCADOPAGO_CLIENT_ID');
  });

  it('falla si falta MERCADOPAGO_CLIENT_SECRET', () => {
    const { error } = envValidationSchema.validate(
      withoutKey('MERCADOPAGO_CLIENT_SECRET'),
      { abortEarly: false },
    );

    expect(error?.message).toContain('MERCADOPAGO_CLIENT_SECRET');
  });

  it('falla si falta MERCADOPAGO_REDIRECT_URI', () => {
    const { error } = envValidationSchema.validate(
      withoutKey('MERCADOPAGO_REDIRECT_URI'),
      { abortEarly: false },
    );

    expect(error?.message).toContain('MERCADOPAGO_REDIRECT_URI');
  });

  it('falla si falta MERCADOPAGO_WEBHOOK_SECRET', () => {
    const { error } = envValidationSchema.validate(
      withoutKey('MERCADOPAGO_WEBHOOK_SECRET'),
      { abortEarly: false },
    );

    expect(error?.message).toContain('MERCADOPAGO_WEBHOOK_SECRET');
  });

  it('permite variables de entorno adicionales no declaradas en el schema', () => {
    const { error } = envValidationSchema.validate(
      { ...validEnv, PATH: '/usr/bin', SOME_OTHER_TOOL_VAR: 'x' },
      { abortEarly: false },
    );

    expect(error).toBeUndefined();
  });
});
