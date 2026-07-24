import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaitlistEntries1784842740643 implements MigrationInterface {
  name = 'AddWaitlistEntries1784842740643';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "waitlist_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "class_id" uuid NOT NULL, "start_at" TIMESTAMPTZ NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_waitlist_entries_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" ADD CONSTRAINT "FK_waitlist_entries_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" ADD CONSTRAINT "FK_waitlist_entries_class" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" DROP CONSTRAINT "FK_waitlist_entries_class"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist_entries" DROP CONSTRAINT "FK_waitlist_entries_user"`,
    );
    await queryRunner.query(`DROP TABLE "waitlist_entries"`);
  }
}
