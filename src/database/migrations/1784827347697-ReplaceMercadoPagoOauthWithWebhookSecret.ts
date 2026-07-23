import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceMercadoPagoOauthWithWebhookSecret1784827347697 implements MigrationInterface {
  name = 'ReplaceMercadoPagoOauthWithWebhookSecret1784827347697';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gyms" DROP COLUMN "mercadopago_oauth_state_expires_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" DROP COLUMN "mercadopago_oauth_state"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" DROP COLUMN "mercadopago_token_expires_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" DROP COLUMN "mercadopago_refresh_token"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD "mercadopago_webhook_secret" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gyms" DROP COLUMN "mercadopago_webhook_secret"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD "mercadopago_refresh_token" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD "mercadopago_token_expires_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD "mercadopago_oauth_state" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD "mercadopago_oauth_state_expires_at" TIMESTAMP`,
    );
  }
}
