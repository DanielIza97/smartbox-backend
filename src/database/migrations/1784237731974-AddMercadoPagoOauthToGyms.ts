import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMercadoPagoOauthToGyms1784237731974 implements MigrationInterface {
  name = 'AddMercadoPagoOauthToGyms1784237731974';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD "mercadopago_user_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD "mercadopago_access_token" character varying`,
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

  public async down(queryRunner: QueryRunner): Promise<void> {
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
      `ALTER TABLE "gyms" DROP COLUMN "mercadopago_access_token"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" DROP COLUMN "mercadopago_user_id"`,
    );
  }
}
