import { MigrationInterface, QueryRunner } from 'typeorm';

// Ata Clases, Turnos de STAFF y Check-ins a una sucursal (Location) — la
// columna se agrega nullable primero para poder backfillearla con datos
// reales antes de exigir NOT NULL, mismo criterio que las migraciones de
// timestamptz de Epic 4 (nunca agregar una columna requerida sin antes
// poblarla). "classes"/"check_ins" ya tienen gym_id directo, así que el
// backfill es un join simple contra locations.gym_id; "shifts" no tiene
// gym_id propio (lo hereda vía staff.gym), así que el backfill pasa por
// users.
export class AddLocationIdToClassesShiftsCheckIns1784905916707 implements MigrationInterface {
  name = 'AddLocationIdToClassesShiftsCheckIns1784905916707';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "classes" ADD "location_id" uuid`);
    await queryRunner.query(`ALTER TABLE "shifts" ADD "location_id" uuid`);
    await queryRunner.query(`ALTER TABLE "check_ins" ADD "location_id" uuid`);

    await queryRunner.query(
      `UPDATE "classes" SET "location_id" = (SELECT "id" FROM "locations" WHERE "locations"."gym_id" = "classes"."gym_id" LIMIT 1)`,
    );
    await queryRunner.query(
      `UPDATE "check_ins" SET "location_id" = (SELECT "id" FROM "locations" WHERE "locations"."gym_id" = "check_ins"."gym_id" LIMIT 1)`,
    );
    await queryRunner.query(
      `UPDATE "shifts" SET "location_id" = (SELECT "l"."id" FROM "locations" "l" INNER JOIN "users" "u" ON "u"."gym_id" = "l"."gym_id" WHERE "u"."id" = "shifts"."staff_id" LIMIT 1)`,
    );

    await queryRunner.query(
      `ALTER TABLE "classes" ALTER COLUMN "location_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "shifts" ALTER COLUMN "location_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_ins" ALTER COLUMN "location_id" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "classes" ADD CONSTRAINT "FK_classes_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shifts" ADD CONSTRAINT "FK_shifts_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_ins" ADD CONSTRAINT "FK_check_ins_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "check_ins" DROP CONSTRAINT "FK_check_ins_location"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shifts" DROP CONSTRAINT "FK_shifts_location"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" DROP CONSTRAINT "FK_classes_location"`,
    );
    await queryRunner.query(
      `ALTER TABLE "check_ins" DROP COLUMN "location_id"`,
    );
    await queryRunner.query(`ALTER TABLE "shifts" DROP COLUMN "location_id"`);
    await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN "location_id"`);
  }
}
