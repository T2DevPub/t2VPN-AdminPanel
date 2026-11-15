#!/bin/sh
set -eu
FILE=/run/t2vpn/db_password
if [ ! -s "$FILE" ]; then echo "Missing auto-generated database credentials" >&2; exit 1; fi
DB_PASSWORD="$(cat "$FILE")"
export DATABASE_URL="postgresql://t2vpn:${DB_PASSWORD}@db:5432/t2vpn?schema=public"
unset DB_PASSWORD
echo "Initializing PostgreSQL schema..."
npx prisma db push --accept-data-loss=false
echo "Provisioning admin account..."
npm run db:seed
exec npm run start
