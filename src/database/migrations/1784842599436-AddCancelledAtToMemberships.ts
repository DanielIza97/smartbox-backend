import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelledAtToMemberships1784842599436 implements MigrationInterface {
  name = 'AddCancelledAtToMemberships1784842599436';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD "cancelled_at" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP COLUMN "cancelled_at"`,
    );
  }
}
