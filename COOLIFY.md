# T2VPN Admin Panel — automatic PostgreSQL deployment on Coolify

## Use Docker Compose, not Dockerfile build pack
1. Create a new **Docker Compose** application/service in Coolify from GitHub `T2DevPub/t2VPN-AdminPanel` on `main`, using `docker-compose.yml`.
2. Provide only these application credentials as Coolify environment variables:
   - `ADMIN_USERNAME` (e.g. admin)
   - `ADMIN_PASSWORD` (at least 12 characters, strong and unique)
   - `AUTH_SECRET` (at least 32 random characters)
3. **Do not supply DATABASE_URL.** The stack creates PostgreSQL, generates and persists random database and VPN profile encryption keys, constructs the private connection string inside the app container, and initializes Prisma tables automatically on startup.
4. Route the public domain to the **app** service, port **3000**, with HTTPS. Do not expose the **db** service publicly.
5. Configure backups for the named volume `t2vpn_pgdata` and protect `t2vpn_secrets`. **Never delete these volumes during redeployment.** The latter contains the database password and VPN profile encryption key. Losing the profile key makes previously encrypted VPN profiles unreadable.
6. After startup, visit `/login`.

## Production cautions
- Automatic `prisma db push` is intended for first-time setup and simple compatible schema changes. It is not a substitute for reviewed production migrations; migrate to `prisma migrate deploy` before risky schema changes.
- `npm run db:seed` runs on each app start and synchronizes the admin password with `ADMIN_PASSWORD`.
- Admin API: `GET/PUT /api/maintenance`. Android compatibility API: `GET /api/settings` (maintenanceMode, maintenanceEndTime as UTC ISO string).
- Maintenance date/time in the dashboard is always IST (UTC+05:30).
- Android ad delivery, VPN config delivery, real-time telemetry and provider SDK integrations are not yet complete.
- Login rate limiting and other internet-facing hardening remain outstanding. This setup has not been tested in Coolify.

## Android Admin Panel V2 API rollout

See [MOBILE_API_V2.md](MOBILE_API_V2.md) for the exact Android contract, Keystore proof-of-possession, billing verification, AdMob SSV and VPN-gateway telemetry integration.

The following **optional** Coolify environment variables now pass through `docker-compose.yml` to the app:
- `MOBILE_PROVISIONING_ENABLED=false` (set to `true` only after validating the Android client and shared OpenVPN credential risk).
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` (server-only Google Play service account JSON encoded in Base64, never in the APK).
- `PLAY_PLUS_PRODUCT_IDS` (comma-separated Google Play subscription products).
- `TELEMETRY_INGEST_SECRET` (32+ random characters; trusted VPN collector only).

`GET /api/health` checks database connectivity. `GET /api/mobile/servers` returns public server metadata with no VPN credentials. `POST /api/mobile/connect` requires an authenticated installation and the provisioning flag. Verified Plus and rewarded access require separate official Google integrations. The database addition is backward compatible but **take a PostgreSQL backup** before the automatic `prisma db push` on redeploy; keep `t2vpn_pgdata` and `t2vpn_secrets` volumes intact.

**Deployment warning:** Previous shared OpenVPN usernames/passwords can be replayed after a client receives them. Treat credentials as extractable by end users and transition to expiring per-user credentials/RADIUS before deploying broad access. Do not rely on a public `.ovpn` listing. Rate limit these endpoints again at your reverse proxy, which must overwrite `X-Real-IP` rather than accepting spoofed forwarding headers.

`/api/telemetry` is intended for a trusted VPN gateway only, never directly from the app. No actual live server usage is visible until that gateway is configured. Ad network SDK integration must be completed in Android.

## Existing PostgreSQL databases: automatic safe unique-index preparation

Startup now runs `npm run db:prepare` **before** `npx prisma db push`. The
preparation step checks whether `AppInstallation` already exists and, if it
does, adds the nullable `subscriptionTokenHash` column (when absent) and
the matching PostgreSQL unique index using idempotent DDL. It does not use
`--accept-data-loss`, truncate tables, or overwrite rows.

If duplicate **non-null** subscription token hashes are already present, the
step stops with an explicit error instead of guessing which row to keep.
Keep the `t2vpn_pgdata` and `t2vpn_secrets` volumes, and make a database
backup before redeployment. The schema update is a one-time action; subsequent
starts should be idempotent.

You should see `Subscription token unique index is ready`, followed by
`The database is already in sync` or a successful `prisma db push`, then
admin account provisioning and Next.js startup. If Prisma warns about a
*different* potentially destructive schema change, investigate that separately.
