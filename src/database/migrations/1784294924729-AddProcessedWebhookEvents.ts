import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessedWebhookEvents1784294924729 implements MigrationInterface {
  name = 'AddProcessedWebhookEvents1784294924729';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "processed_webhook_events" ("id" character varying NOT NULL, "type" character varying NOT NULL, "processed_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_80f4f20ca1cace20dd6e3a714c1" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "processed_webhook_events"`);
  }
}
