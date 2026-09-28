import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1770000000000 implements MigrationInterface {
    name = 'InitialSchema1770000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TYPE "public"."Workspaces_type_enum" AS ENUM('meeting_room', 'open_space', 'private_office')`);
        await queryRunner.query(`CREATE TABLE "Workspaces" ("id" SERIAL NOT NULL, "title" character varying(96) NOT NULL, "description" text, "pricePerHour" integer NOT NULL, "capacity" integer NOT NULL DEFAULT '1', "type" "public"."Workspaces_type_enum" NOT NULL, "imageUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_35160e1c18ee262230a1848e5fd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_da87435c2e398889931be079ef" ON "Workspaces" ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_59bae69ecfbb58d5f2be4ac40b" ON "Workspaces" ("createdAt") `);
        await queryRunner.query(`CREATE TYPE "public"."Users_role_enum" AS ENUM('admin', 'user', 'manager')`);
        await queryRunner.query(`CREATE TABLE "Users" ("id" SERIAL NOT NULL, "firstName" character varying(96) NOT NULL, "lastName" character varying(96) NOT NULL, "email" character varying(96) NOT NULL, "password" character varying(96), "googleId" character varying, "twoFASecret" character varying, "isTwoFAEnabled" boolean NOT NULL DEFAULT false, "role" "public"."Users_role_enum" NOT NULL DEFAULT 'user', "refreshToken" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UQ_3c3ab3f49a87e6ddb607f3c4945" UNIQUE ("email"), CONSTRAINT "UQ_1890a56ce1dc8028f854699ffab" UNIQUE ("googleId"), CONSTRAINT "PK_16d4f7d636df336db11d87413e3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "PromoCodes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "maxUses" integer NOT NULL DEFAULT '1', "remainingUses" integer NOT NULL DEFAULT '1', "isActive" boolean NOT NULL DEFAULT true, "discountPercentage" integer NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "conditions" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UQ_0138eb1d8f42f540af5a0df754b" UNIQUE ("code"), CONSTRAINT "PK_6320c242c0130684e6864105cab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."Bookings_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "Bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "price" integer NOT NULL, "startTime" TIMESTAMP NOT NULL, "endTime" TIMESTAMP NOT NULL, "paymentSessionId" character varying, "currency" character varying(3) NOT NULL DEFAULT 'UAH', "status" "public"."Bookings_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "userId" integer, "workspaceId" integer, "promoCodeId" uuid, CONSTRAINT "PK_383e0a5652b33012e15e1d0192a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9154ba42728899ce737b81fb69" ON "Bookings" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d3757a1e9d789a9b7253f518f1" ON "Bookings" ("workspaceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_1c77a37b05e50d5dc0a19ae0fc" ON "Bookings" ("promoCodeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_29b27405cb8982e4b122448726" ON "Bookings" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_8838c6fd280873fef378871f00" ON "Bookings" ("workspaceId", "startTime", "endTime") `);
        await queryRunner.query(`CREATE TABLE "Waitlists" ("id" SERIAL NOT NULL, "startTime" TIMESTAMP NOT NULL, "endTime" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, "workspaceId" integer, CONSTRAINT "PK_71a3ad7a99e33c88bb4c4ca565f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_de9782ef5017d50733a7f3b1cd" ON "Waitlists" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f840792c72d2e00dd8d74ab5a7" ON "Waitlists" ("workspaceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_eb6cf0951be88d746854b88be1" ON "Waitlists" ("workspaceId", "startTime", "endTime") `);
        await queryRunner.query(`ALTER TABLE "Bookings" ADD CONSTRAINT "FK_9154ba42728899ce737b81fb694" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "Bookings" ADD CONSTRAINT "FK_d3757a1e9d789a9b7253f518f18" FOREIGN KEY ("workspaceId") REFERENCES "Workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "Bookings" ADD CONSTRAINT "FK_1c77a37b05e50d5dc0a19ae0fc6" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "Waitlists" ADD CONSTRAINT "FK_de9782ef5017d50733a7f3b1cde" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "Waitlists" ADD CONSTRAINT "FK_f840792c72d2e00dd8d74ab5a78" FOREIGN KEY ("workspaceId") REFERENCES "Workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "Waitlists" DROP CONSTRAINT "FK_f840792c72d2e00dd8d74ab5a78"`);
        await queryRunner.query(`ALTER TABLE "Waitlists" DROP CONSTRAINT "FK_de9782ef5017d50733a7f3b1cde"`);
        await queryRunner.query(`ALTER TABLE "Bookings" DROP CONSTRAINT "FK_1c77a37b05e50d5dc0a19ae0fc6"`);
        await queryRunner.query(`ALTER TABLE "Bookings" DROP CONSTRAINT "FK_d3757a1e9d789a9b7253f518f18"`);
        await queryRunner.query(`ALTER TABLE "Bookings" DROP CONSTRAINT "FK_9154ba42728899ce737b81fb694"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eb6cf0951be88d746854b88be1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f840792c72d2e00dd8d74ab5a7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_de9782ef5017d50733a7f3b1cd"`);
        await queryRunner.query(`DROP TABLE "Waitlists"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8838c6fd280873fef378871f00"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_29b27405cb8982e4b122448726"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1c77a37b05e50d5dc0a19ae0fc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d3757a1e9d789a9b7253f518f1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9154ba42728899ce737b81fb69"`);
        await queryRunner.query(`DROP TABLE "Bookings"`);
        await queryRunner.query(`DROP TYPE "public"."Bookings_status_enum"`);
        await queryRunner.query(`DROP TABLE "PromoCodes"`);
        await queryRunner.query(`DROP TABLE "Users"`);
        await queryRunner.query(`DROP TYPE "public"."Users_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_59bae69ecfbb58d5f2be4ac40b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_da87435c2e398889931be079ef"`);
        await queryRunner.query(`DROP TABLE "Workspaces"`);
        await queryRunner.query(`DROP TYPE "public"."Workspaces_type_enum"`);
    }

}
