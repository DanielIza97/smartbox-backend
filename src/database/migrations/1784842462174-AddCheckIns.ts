import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCheckIns1784842462174 implements MigrationInterface {
  name = 'AddCheckIns1784842462174';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "check_ins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "gym_id" uuid NOT NULL, "reservation_id" uuid, "checked_in_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "checked_out_at" TIMESTAMPTZ, CONSTRAINT "PK_check_ins_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_ins" ADD CONSTRAINT "FK_check_ins_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_ins" ADD CONSTRAINT "FK_check_ins_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_ins" ADD CONSTRAINT "FK_check_ins_reservation" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "check_ins" DROP CONSTRAINT "FK_check_ins_reservation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_ins" DROP CONSTRAINT "FK_check_ins_gym"`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_ins" DROP CONSTRAINT "FK_check_ins_user"`,
    );
    await queryRunner.query(`DROP TABLE "check_ins"`);
  }
}
