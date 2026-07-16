import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGymAndUserGymId1784232885248 implements MigrationInterface {
  name = 'AddGymAndUserGymId1784232885248';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "gyms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "address" character varying, "timezone" character varying NOT NULL DEFAULT 'UTC', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fe765086496cf3c8475652cddcb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "gym_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_05641d53aff179b24c86e23419a" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_05641d53aff179b24c86e23419a"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "gym_id"`);
    await queryRunner.query(`DROP TABLE "gyms"`);
  }
}
