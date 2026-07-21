import { MigrationInterface, QueryRunner } from 'typeorm';

// Continuación de ConvertTimestampsToTimestamptz1784313531681 — esa
// migración no cubrió estas cuatro columnas, que quedaron como
// `timestamp` (sin timezone) desde que se crearon (InitialSchema y
// AddMercadoPagoOauthToGyms). Gatean el state de un solo uso del OAuth
// con Mercado Pago y los tokens de un solo uso de reset de contraseña /
// cambio de email — el mismo bug de interpretación de hora si el
// proceso de Node corre en una timezone distinta a la del server de
// Postgres (ver CLAUDE.md, sección de Epic 4). Mismo patrón que la
// migración anterior: ALTER COLUMN ... USING ... AT TIME ZONE 'UTC' en
// vez de DROP+ADD, para no perder los tokens/estados pendientes.
export class ConvertRemainingTimestampsToTimestamptz1784645361669 implements MigrationInterface {
  name = 'ConvertRemainingTimestampsToTimestamptz1784645361669';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gyms" ALTER COLUMN "mercadopago_token_expires_at" TYPE TIMESTAMPTZ USING "mercadopago_token_expires_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ALTER COLUMN "mercadopago_oauth_state_expires_at" TYPE TIMESTAMPTZ USING "mercadopago_oauth_state_expires_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "reset_password_expires" TYPE TIMESTAMPTZ USING "reset_password_expires" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email_change_token_expires" TYPE TIMESTAMPTZ USING "email_change_token_expires" AT TIME ZONE 'UTC'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email_change_token_expires" TYPE TIMESTAMP USING "email_change_token_expires" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "reset_password_expires" TYPE TIMESTAMP USING "reset_password_expires" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ALTER COLUMN "mercadopago_oauth_state_expires_at" TYPE TIMESTAMP USING "mercadopago_oauth_state_expires_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ALTER COLUMN "mercadopago_token_expires_at" TYPE TIMESTAMP USING "mercadopago_token_expires_at" AT TIME ZONE 'UTC'`,
    );
  }
}
