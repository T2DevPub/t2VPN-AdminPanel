/**
 * CI fixture: recreate the old AppInstallation table with a real row, then
 * verify that the V2 schema startup preserves it. This touches CI only.
 */
import {PrismaClient} from '@prisma/client';
import {strict as assert} from 'node:assert';
const db=new PrismaClient();
const installationId='22222222-3333-4444-8555-666666666666';
try{
  if(process.argv[2]==='seed'){
    await db.$executeRawUnsafe(`
      CREATE TABLE "AppInstallation" (
        "id" TEXT NOT NULL,
        "installationId" TEXT NOT NULL,
        "deviceModel" TEXT NOT NULL DEFAULT '',
        "manufacturer" TEXT NOT NULL DEFAULT '',
        "androidVersion" TEXT NOT NULL DEFAULT '',
        "appVersion" TEXT NOT NULL DEFAULT '',
        "countryCode" TEXT NOT NULL DEFAULT '',
        "plan" TEXT NOT NULL DEFAULT 'FREE',
        "subscriptionExpiresAt" TIMESTAMP(3),
        "revoked" BOOLEAN NOT NULL DEFAULT FALSE,
        "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AppInstallation_pkey" PRIMARY KEY ("id")
      )
    `);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX "AppInstallation_installationId_key" ON "AppInstallation" ("installationId")`);
    await db.$executeRawUnsafe(`INSERT INTO "AppInstallation" ("id","installationId","deviceModel") VALUES ('legacy-ci-keep', $1, 'Preserve existing device')`,installationId);
    console.log('Seeded pre-upgrade AppInstallation row.');
  } else if(process.argv[2]==='verify'){
    const row=await db.appInstallation.findUnique({where:{installationId}});
    assert.equal(row?.id,'legacy-ci-keep');
    assert.equal(row?.deviceModel,'Preserve existing device');
    assert.equal(row?.subscriptionTokenHash,null);
    const indexes=await db.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename='AppInstallation' AND indexname='AppInstallation_subscriptionTokenHash_key'`);
    assert.equal(indexes.length,1);
    console.log('Existing AppInstallation data survived the V2 index migration.');
  } else throw new Error('Usage: node scripts/ci-existing-installation.mjs seed|verify');
}catch(e){console.error(e);process.exitCode=1}
finally{await db.$disconnect()}
