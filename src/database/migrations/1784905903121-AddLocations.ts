import { MigrationInterface, QueryRunner } from 'typeorm';

// Sucursales (Fase 1 post-v1.5) — crea la tabla y, en la misma migración,
// backfillea una "Sucursal Principal" por cada Gym existente (mismo nombre
// que LocationsService.createDefault() usa para gimnasios nuevos), para que
// ningún gimnasio quede sin al menos una sucursal antes de que la migración
// siguiente (AddLocationIdToClassesShiftsCheckIns) empiece a atar Clases/
// Turnos/Check-ins a una Location.
export class AddLocations1784905903121 implements MigrationInterface {
  name = 'AddLocations1784905903121';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "gym_id" uuid NOT NULL, "name" character varying NOT NULL, "address" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_locations_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "locations" ADD CONSTRAINT "FK_locations_gym" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "locations" ("id", "gym_id", "name", "address") SELECT uuid_generate_v4(), "id", 'Sucursal Principal', "address" FROM "gyms"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "locations" DROP CONSTRAINT "FK_locations_gym"`,
    );
    await queryRunner.query(`DROP TABLE "locations"`);
  }
}
