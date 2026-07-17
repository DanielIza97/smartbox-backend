import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoices1784298203889 implements MigrationInterface {
  name = 'AddInvoices1784298203889';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "membership_id" uuid NOT NULL, "amount_cents" integer NOT NULL, "status" character varying NOT NULL, "mercadopago_payment_id" character varying NOT NULL, "paid_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_0a012bb518985a23be8e9288c04" UNIQUE ("mercadopago_payment_id"), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_8d63b61177761f33d0185abc28f" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_8d63b61177761f33d0185abc28f"`,
    );
    await queryRunner.query(`DROP TABLE "invoices"`);
  }
}
