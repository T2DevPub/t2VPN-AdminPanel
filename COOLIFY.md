# T2VPN Admin Panel — automatic PostgreSQL deployment on Coolify

## Use Docker Compose, not Dockerfile build pack
1. Create a new **Docker Compose** application/service in Coolify from GitHub `T2DevPub/t2VPN-AdminPanel` on `main`, using `docker-compose.yml`.
2. Provide the following required application credentials as Coolify environment variables:
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

## Ad Management save behind Coolify's reverse proxy

The administrator's browser sends requests from `https://vpn2.t2dev.in`, but
the Next.js request URL inside Docker can be `http://app:3000`. Comparing
these two URLs causes a false `403 Invalid origin` when saving Ad Management.

This deployment now passes `ADMIN_PUBLIC_ORIGIN` into the app container.
The Docker Compose default is `https://vpn2.t2dev.in`; change the variable
in Coolify **only if** the public dashboard's origin changes (include scheme,
hostname, and port when nonstandard). Example:

```
ADMIN_PUBLIC_ORIGIN=https://vpn2.t2dev.in
```

The save endpoint permits exactly that origin and still rejects other browser
origins, including requests that spoof `X-Forwarded-Host`. Keep the variable
server-side; it does not contain a secret. The origin must match your address
bar exactly; do not use `http://app:3000` or `http://db:5432`.

The simplified Ad Management UI has three steps: assign placements, add
provider units, and optionally create country rules. Provider toggles and
the global ad switch appear at the top; less-used settings are under
**Advanced settings**. The API storage key remains `ad_management_v2`,
and the Android `GET /api/mobile/ads` contract is unchanged.

After redeploy: open `/dashboard/ad-management`, switch Yandex on,
add the ad units, assign them to the banner/native/interstitial placements,
click **Save changes**, then confirm the green saved message and refresh.
For Russia: inspect `/api/mobile/ads?country=RU` and make sure the
placement has `enabled: true` and `primary.provider: "ADFOX"`.
A saved ad unit does not automatically guarantee ad fill in Android.

## Protecting PostgreSQL and secrets across every Coolify redeploy

**Existing V2 production instances (including `vpn2.t2dev.in`):**

- The original Docker Compose volume names `t2vpn_pgdata` and
  `t2vpn_secrets` have **not changed**. They are still mounted at the exact
  same paths. Normal container replacement preserves them.
- New protection: `REQUIRE_EXISTING_DATA=true` by default. Before PostgreSQL
  can start, a one-shot `secrets-init` preflight verifies that `PG_VERSION`,
  the original database password and the original OpenVPN encryption key
  all exist. If any are missing, **deployment fails rather than starting an
  empty database or regenerating credentials.**
- A third persistent volume `t2vpn_backups` is mounted at `/backups` in
  the app. On **every app startup**, before schema preparation or
  `prisma db push`, a verified **custom-format `pg_dump`** is saved as
  `/backups/predeploy-YYYYMMDDTHHMMSSZ-PID.dump`. If pg_dump or archive
  verification fails, the schema is not modified and the app does not start.
  These snapshots are stored on the deployment server, not in GitHub.
- The successful first backup creates `/backups/.database_initialized`.
  Later startup checks this marker as another guard against losing the
  original Postgres or secrets volumes. The backup volume **does not**
  contain the secret encryption key; it must be backed up separately.
- Neither `prisma migrate reset` nor `prisma db push --accept-data-loss`
  runs automatically. Prisma still refuses schema changes with data-loss
  warnings. **This does not replace reviewing new schema changes.**
- The one-time `db:seed` command is idempotent for the admin account,
  but it updates the admin's password hash to match `ADMIN_PASSWORD` on
  every application start; other VPN and ad records are not seeded/reset.

**VERY IMPORTANT BEFORE REDEPLOYING AN ALREADY CONFIGURED INSTANCE:**

1. Keep deploying the **same Coolify resource on the same server**, using the
   same Docker Compose resource/project identifier. Do not rename its Docker
   volumes or create a replacement resource and expect the old volumes to
   attach automatically.
2. Confirm all three original mounts exist in Coolify:
   - `t2vpn_pgdata` → `db:/var/lib/postgresql/data`
   - `t2vpn_secrets` → `db:/run/t2vpn` and `app:/run/t2vpn`
   New `t2vpn_backups` → `app:/backups` is created automatically by Compose.
3. Set `REQUIRE_EXISTING_DATA=true` in your Coolify environment variables
   (this is already the Compose default). Back up **both original volumes**
   first, especially the encryption key. Keep `AUTH_SECRET` unchanged.
4. Redeploy `main`. In app Runtime Logs, look for
   `BACKUP OK: PostgreSQL snapshot verified`, then
   `Preparing safe PostgreSQL index changes...`,
   `Initializing PostgreSQL schema...`, and Next.js startup.
5. Verify `/api/health`, `/api/mobile/servers` and an authenticated
   Ad Management page. Confirm your known VPN servers and Yandex IDs
   remain unchanged. In the app container's terminal, `ls -l /backups`
   should show `predeploy-*.dump`.
6. Schedule **separate off-server backups** of PostgreSQL and the *original*
   `t2vpn_secrets` volume. Keep secure encrypted copies on another server,
   S3-compatible storage or a trustworthy remote destination. Test restoring
   into an isolated stack. The local snapshots are not disaster recovery.
7. Monitor free disk space in Coolify. The script deliberately does not
   delete prior backups; establish a separate reviewed retention plan once
   remote copies are verified.

**Brand-new empty deployments only:** set `REQUIRE_EXISTING_DATA=false` on
the first boot, because no Postgres database or keys exist yet. After the app
starts, a snapshot and marker are written, and the first data is saved, set
`REQUIRE_EXISTING_DATA=true`. Never set it false as a workaround for a
missing production volume.

**When the guard blocks a deployment:** do NOT delete the old volumes, reset
PostgreSQL, generate new secrets or switch off the guard. Find the original
volume names on the Coolify server (`docker volume ls`), attach the correct
volumes to the same Compose resource, or restore from verified backups. In
particular, losing `t2vpn_secrets/profile_key` makes encrypted OpenVPN
profiles unreadable until the original encryption key is restored.

Coolify documentation:
- https://coolify.io/docs/core/docker-and-containers
- https://coolify.io/docs/core/persistent-storage/storage-mounts/overview
- https://coolify.io/docs/applications/builds/docker-compose
- https://coolify.io/docs/databases/backups

**Warning:** changing the Coolify resource UUID/project name can produce a
new set of implicitly project-prefixed named Docker volumes. A code change
cannot automatically recover data from volumes owned by a different resource.
Never treat an empty new database as an expected redeployment result.

## Next.js app health check (Coolify)

Docker Compose now defines an **app healthcheck** in addition to the
existing PostgreSQL healthcheck. The app runs a Node.js HTTP probe against
`http://127.0.0.1:3000/api/health` **inside its own container** every
30 seconds. A 200 response means Next.js is responding and the existing
health route can query PostgreSQL; a non-2xx response or failed connection
fails the probe. Docker allows up to 180 seconds of startup grace for
schema preparation, backups, and seeding.

Deploy the same V2 Coolify resource from `main` (do not recreate its
Compose project or volumes). After redeploy, the app should move from
`Running (no healthcheck)` to `Running (healthy)` **if its health probe
succeeds**. Database health checks are unchanged. If the app is unhealthy,
inspect the app runtime logs and run:

```sh
node -e "fetch('http://127.0.0.1:3000/api/health').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1) }).catch(e => { console.error(e.message); process.exit(1) })"
```

Do not use an external `vpn2.t2dev.in` URL for this container probe:
the healthcheck must check the local app rather than DNS or Coolify's
reverse proxy. **Docker health status does not, by itself, restart an
unhealthy container**; restart/alerting must be configured separately.

The healthcheck has no database schema, volume, secret, admin account,
VPN profile, or advertising configuration changes.
