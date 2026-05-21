import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDatabaseIndexes1779401190296 implements MigrationInterface {
  name = 'AddDatabaseIndexes1779401190296';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_da87435c2e398889931be079ef" ON "Workspaces" ("type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_59bae69ecfbb58d5f2be4ac40b" ON "Workspaces" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_de9782ef5017d50733a7f3b1cd" ON "Waitlists" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f840792c72d2e00dd8d74ab5a7" ON "Waitlists" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb6cf0951be88d746854b88be1" ON "Waitlists" ("workspaceId", "startTime", "endTime") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9154ba42728899ce737b81fb69" ON "Bookings" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3757a1e9d789a9b7253f518f1" ON "Bookings" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1c77a37b05e50d5dc0a19ae0fc" ON "Bookings" ("promoCodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_29b27405cb8982e4b122448726" ON "Bookings" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8838c6fd280873fef378871f00" ON "Bookings" ("workspaceId", "startTime", "endTime") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8838c6fd280873fef378871f00"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_29b27405cb8982e4b122448726"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1c77a37b05e50d5dc0a19ae0fc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d3757a1e9d789a9b7253f518f1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9154ba42728899ce737b81fb69"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eb6cf0951be88d746854b88be1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f840792c72d2e00dd8d74ab5a7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_de9782ef5017d50733a7f3b1cd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_59bae69ecfbb58d5f2be4ac40b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_da87435c2e398889931be079ef"`,
    );
  }
}
