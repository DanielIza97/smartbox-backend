import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShifts1784312433970 implements MigrationInterface {
  name = 'AddShifts1784312433970';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "shifts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "staff_id" uuid NOT NULL, "day_of_week" integer NOT NULL, "start_time" character varying NOT NULL, "end_time" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_84d692e367e4d6cdf045828768c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "shifts" ADD CONSTRAINT "FK_5d750ec7e9b1c0c4f4edb89621f" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shifts" DROP CONSTRAINT "FK_5d750ec7e9b1c0c4f4edb89621f"`,
    );
    await queryRunner.query(`DROP TABLE "shifts"`);
  }
}
