#!/bin/sh
# Preserve an ONLINE, transactionally consistent PostgreSQL snapshot before
# each Prisma schema preparation, schema sync or seed. Never touch live rows.
set -eu
umask 077
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_PASSWORD_FILE="${BACKUP_DB_PASSWORD_FILE:-/run/t2vpn/db_password}"
BACKUP_DB_HOST="${BACKUP_DB_HOST:-db}"
BACKUP_DB_USER="${BACKUP_DB_USER:-t2vpn}"
BACKUP_DB_NAME="${BACKUP_DB_NAME:-t2vpn}"
if [ ! -s "$DB_PASSWORD_FILE" ]; then
  echo "BACKUP ERROR: Original PostgreSQL password file missing; cannot safely proceed." >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"
if [ ! -w "$BACKUP_DIR" ]; then
  echo "BACKUP ERROR: Persistent backup volume is not writable; refusing database schema changes." >&2
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  echo "BACKUP ERROR: pg_dump/pg_restore are unavailable; refusing schema changes." >&2
  exit 1
fi
tmp="$(mktemp "$BACKUP_DIR/.predeploy-XXXXXXXX")"
trap 'rm -f "$tmp"' EXIT
trap 'exit 1' HUP INT TERM
PGPASSWORD="$(cat "$DB_PASSWORD_FILE")" pg_dump \
  --host="$BACKUP_DB_HOST" \
  --username="$BACKUP_DB_USER" \
  --dbname="$BACKUP_DB_NAME" \
  --format=custom \
  --no-owner --no-acl \
  --file="$tmp"
if [ ! -s "$tmp" ] || ! pg_restore --list "$tmp" >/dev/null; then
  echo "BACKUP ERROR: PostgreSQL snapshot did not validate; refusing database schema changes." >&2
  exit 1
fi
# Keep all snapshots by default; an external backup job should enforce
# retention after independently verifying off-server copies.
stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
target="$BACKUP_DIR/predeploy-$stamp-$$.dump"
mv "$tmp" "$target"
trap - EXIT
# Sentinel protects against accidentally starting a freshly initialized db
# later while the original persistent backup volume still exists.
printf '%s\n' "Initialized database backup recorded at $stamp" > "$BACKUP_DIR/.database_initialized"
chmod 600 "$target" "$BACKUP_DIR/.database_initialized"
echo "BACKUP OK: PostgreSQL snapshot verified and saved on persistent volume ($target)."
echo "Reminder: separately back up PostgreSQL and the ORIGINAL t2vpn_secrets volume off the Coolify server."
