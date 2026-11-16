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

## V2 integration update (2026-11-16)

- The V2 Next.js/PostgreSQL dashboard remains the production architecture. The old Express/EJS/SQLite repository is **a feature reference, not a deployable replacement**. No SQLite database or secrets have been copied into V2.
- Public APIs: `GET /api/mobile/ads?country=RU` (versioned per-placement settings with network fallback), `GET /api/ads?country=RU` (best-effort legacy AdMob/Meta/Yandex IDs), `GET /api/mobile/servers` (server metadata only), `GET /api/mobile/config`, and `GET /api/settings`. Android profile provisioning is **not** implemented by the public directory. The admin-only `GET /api/servers` remains protected.
- Set optional `TELEMETRY_INGEST_SECRET` to a **random 32+ character secret** in Coolify and use that value only on a trusted VPN server/gateway backend. Never include it in the Android APK. `POST /api/telemetry` returns the session ID for a successful CONNECT, accepts HEARTBEAT with cumulative `bytesIn`/`bytesOut` every 15–30s, and closes the session on DISCONNECT. Session liveness is based on an authenticated heartbeat within 60 seconds.
- Before changing the production stack, take a PostgreSQL backup and preserve the **existing** `t2vpn_pgdata` and `t2vpn_secrets` volumes. The new nullable heartbeat column is additive. `prisma db push` runs on restart; review changes before rollout.
- Do not automatically point an existing Android release at V2. The old public `/api/servers` returned credentials and OpenVPN text; that was unsafe. V2 does not expose those secrets. The Android client requires separately authenticated provisioning/entitlement integration to establish connections against V2. Test APKs on a staging domain first.
- Existing server entries can be recreated in V2 with encrypted Configuration 1 and optional Configuration 2; Free users use Config 2 when present, Plus uses Config 1. There is **no automatic import of the old SQLite data**, which may include exposed secrets.
- `/dashboard/connections` is now a 15-second-refresh network dashboard; the detailed `/dashboard/analytics` page also polls every 15 seconds. Both reflect only real submitted counters, not the older dashboard's fabricated 0.005 GB per user increments.
- Run the GitHub build workflow before merging the V2 feature branch into `main`. Merging into main may trigger Coolify automatic deployment.
