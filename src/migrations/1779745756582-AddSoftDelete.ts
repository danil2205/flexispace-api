import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSoftDelete1779745756582 implements MigrationInterface {
    name = 'AddSoftDelete1779745756582'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Workspaces" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "PromoCodes" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "Users" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "Bookings" ADD "deletedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Bookings" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "Users" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "PromoCodes" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "Workspaces" DROP COLUMN "deletedAt"`);
    }

}
