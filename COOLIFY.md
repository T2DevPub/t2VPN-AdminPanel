# T2VPN Admin Panel — automatic PostgreSQL deployment on Coolify

## Use Docker Compose, not Dockerfile build pack
1. Create a new **Docker Compose** application/service in Coolify from GitHub `T2DevPub/t2VPN-AdminPanel` on `main`, using `docker-compose.yml`.
2. Provide only these application credentials as Coolify environment variables:
   - `ADMIN_USERNAME` (e.g. admin)
   - `ADMIN_PASSWORD` (at least 12 characters, strong and unique)
   - `AUTH_SECRET` (at least 32 random characters)
   - `VPN_PROFILE_ENCRYPTION_KEY` (64 random hexadecimal characters)
3. **Do not supply DATABASE_URL.** The stack creates PostgreSQL, generates and persists a random database password, constructs the private connection string inside the app container, and initializes Prisma tables automatically on startup.
4. Route the public domain to the **app** service, port **3000**, with HTTPS. Do not expose the **db** service publicly.
5. Configure backups for the named volume `t2vpn_pgdata` and protect `t2vpn_secrets`. **Never delete these volumes during redeployment.** The latter contains the database password.
6. After startup, visit `/login`.

## Production cautions
- Automatic `prisma db push` is intended for first-time setup and simple compatible schema changes. It is not a substitute for reviewed production migrations; migrate to `prisma migrate deploy` before risky schema changes.
- `npm run db:seed` runs on each app start and synchronizes the admin password with `ADMIN_PASSWORD`.
- Admin API: `GET/PUT /api/maintenance`. Android compatibility API: `GET /api/settings` (maintenanceMode, maintenanceEndTime as UTC ISO string).
- Maintenance date/time in the dashboard is always IST (UTC+05:30).
- Android ad delivery, VPN config delivery, real-time telemetry and provider SDK integrations are not yet complete.
- Login rate limiting and other internet-facing hardening remain outstanding. This setup has not been tested in Coolify.
