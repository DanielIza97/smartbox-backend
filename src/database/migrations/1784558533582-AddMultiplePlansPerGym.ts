import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMultiplePlansPerGym1784558533582 implements MigrationInterface {
  name = 'AddMultiplePlansPerGym1784558533582';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pending_subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "mercadopago_preapproval_id" character varying NOT NULL, "plan_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d56ed9a03ce16068df2721847e8" UNIQUE ("mercadopago_preapproval_id"), CONSTRAINT "PK_feb373e49606ee2d4c7f96af490" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" DROP CONSTRAINT "FK_3b9ea2f1daec81a3c2cb535dab9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" DROP CONSTRAINT "UQ_3b9ea2f1daec81a3c2cb535dab9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" ADD CONSTRAINT "FK_3b9ea2f1daec81a3c2cb535dab9" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pending_subscriptions" ADD CONSTRAINT "FK_5d024f0f0040d9a2ad68767f629" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pending_subscriptions" DROP CONSTRAINT "FK_5d024f0f0040d9a2ad68767f629"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" DROP CONSTRAINT "FK_3b9ea2f1daec81a3c2cb535dab9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" ADD CONSTRAINT "UQ_3b9ea2f1daec81a3c2cb535dab9" UNIQUE ("gym_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" ADD CONSTRAINT "FK_3b9ea2f1daec81a3c2cb535dab9" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`DROP TABLE "pending_subscriptions"`);
  }
}
