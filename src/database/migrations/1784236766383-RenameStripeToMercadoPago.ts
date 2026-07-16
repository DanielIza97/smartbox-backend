import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameStripeToMercadoPago1784236766383 implements MigrationInterface {
  name = 'RenameStripeToMercadoPago1784236766383';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plans" RENAME COLUMN "stripe_price_id" TO "mercadopago_plan_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" RENAME COLUMN "stripe_subscription_id" TO "mercadopago_preapproval_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" RENAME COLUMN "mercadopago_preapproval_id" TO "stripe_subscription_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" RENAME COLUMN "mercadopago_plan_id" TO "stripe_price_id"`,
    );
  }
}
