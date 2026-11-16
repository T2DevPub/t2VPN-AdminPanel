/**
 * Add the subscription token uniqueness index safely before Prisma db push.
 *
 * Prisma treats adding @unique to an existing table as a potential data-loss
 * operation and refuses to apply the rest of the schema. This preparatory
 * migration creates only the nullable column and its unique index. Existing
 * installation rows and other schema objects remain untouched.
 *
 * PostgreSQL permits multiple NULL values in a UNIQUE index. Non-null
 * duplicates are treated as a hard error; they are never removed or altered.
 */
import {PrismaClient} from '@prisma/client';

const db=new PrismaClient();
async function main(){
  const tables=await db.$queryRaw<Array<{exists:boolean}>>`
    SELECT to_regclass('"AppInstallation"') IS NOT NULL AS "exists"
  `;
  if(!tables[0]?.exists){
    console.log('AppInstallation does not exist yet; Prisma will create the table and index.');
    return;
  }
  console.log('Checking existing AppInstallation records before the unique index migration...');
  await db.$executeRaw`
    ALTER TABLE "AppInstallation"
      ADD COLUMN IF NOT EXISTS "subscriptionTokenHash" TEXT
  `;
  const duplicates=await db.$queryRaw<Array<{duplicateCount:bigint}>>`
    SELECT COUNT(*)::BIGINT AS "duplicateCount"
    FROM (
      SELECT "subscriptionTokenHash"
      FROM "AppInstallation"
      WHERE "subscriptionTokenHash" IS NOT NULL
      GROUP BY "subscriptionTokenHash"
      HAVING COUNT(*) > 1
    ) AS repeated
  `;
  if((duplicates[0]?.duplicateCount??BigInt(0))>BigInt(0)){
    throw new Error(
      'Cannot add subscriptionTokenHash uniqueness: duplicate non-null token hashes exist. '+
      'Resolve duplicates manually after taking a database backup; no rows have been deleted.'
    );
  }
  await db.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "AppInstallation_subscriptionTokenHash_key"
    ON "AppInstallation" ("subscriptionTokenHash")
  `;
  console.log('Subscription token unique index is ready; existing installation rows were preserved.');
}
main()
 .catch(error=>{console.error('Safe subscription index preparation failed:',error);process.exitCode=1})
 .finally(async()=>{await db.$disconnect()});
