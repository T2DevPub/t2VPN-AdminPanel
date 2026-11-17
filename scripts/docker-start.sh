#!/bin/sh
set -eu
FILE=/run/t2vpn/db_password
if [ ! -s "$FILE" ]; then echo "Missing auto-generated database credentials" >&2; exit 1; fi
DB_PASSWORD="$(cat "$FILE")"
KEY_FILE=/run/t2vpn/profile_key
if [ ! -s "$KEY_FILE" ]; then echo "Missing auto-generated VPN encryption key" >&2; exit 1; fi
export VPN_PROFILE_ENCRYPTION_KEY="$(cat "$KEY_FILE")"
export DATABASE_URL="postgresql://t2vpn:${DB_PASSWORD}@db:5432/t2vpn?schema=public"
unset DB_PASSWORD
echo "Backing up PostgreSQL before schema migration..."
sh scripts/backup-before-migration.sh
echo "Preparing safe PostgreSQL index changes..."
npm run db:prepare
echo "Initializing PostgreSQL schema..."
npx prisma db push
echo "Provisioning admin account..."
npm run db:seed
exec npm run start
