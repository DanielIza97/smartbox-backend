import { MigrationInterface, QueryRunner } from 'typeorm';

// Fix de un bug real: estas columnas eran `timestamp` (sin timezone), que
// se malinterpretan al leerlas de vuelta si el proceso de Node corre en una
// timezone distinta a la del server de Postgres (ver CLAUDE.md). Se usa
// ALTER COLUMN ... USING ... AT TIME ZONE 'UTC' en vez del DROP+ADD que
// generó el CLI por defecto, para no perder los valores existentes — los
// valores naive ya representados asumen hora UTC (la sesión de Postgres
// corre en UTC, ver TimeZone GUC), así que la reinterpretación es un
// no-op de valor, solo cambia el tipo de columna.
export class ConvertTimestampsToTimestamptz1784313531681 implements MigrationInterface {
  name = 'ConvertTimestampsToTimestamptz1784313531681';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" ALTER COLUMN "trial_ends_at" TYPE TIMESTAMPTZ USING "trial_ends_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ALTER COLUMN "current_period_end" TYPE TIMESTAMPTZ USING "current_period_end" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ALTER COLUMN "paid_at" TYPE TIMESTAMPTZ USING "paid_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "start_at" TYPE TIMESTAMPTZ USING "start_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "end_at" TYPE TIMESTAMPTZ USING "end_at" AT TIME ZONE 'UTC'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "end_at" TYPE TIMESTAMP USING "end_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "start_at" TYPE TIMESTAMP USING "start_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ALTER COLUMN "paid_at" TYPE TIMESTAMP USING "paid_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ALTER COLUMN "current_period_end" TYPE TIMESTAMP USING "current_period_end" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ALTER COLUMN "trial_ends_at" TYPE TIMESTAMP USING "trial_ends_at" AT TIME ZONE 'UTC'`,
    );
  }
}
