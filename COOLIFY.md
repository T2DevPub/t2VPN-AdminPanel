# T2VPN Admin Panel — Coolify deployment

This repository is a Next.js application with PostgreSQL, **not** the legacy index.html prototype.

## Coolify
1. Create a PostgreSQL database and record its internal connection URL.
2. Add a new application from GitHub repository T2DevPub/t2VPN-AdminPanel, branch main.
3. Select Dockerfile build pack, port 3000, and configure your HTTPS domain.
4. Configure environment variables: DATABASE_URL, AUTH_SECRET (32+ random characters), ADMIN_USERNAME, ADMIN_PASSWORD, VPN_PROFILE_ENCRYPTION_KEY (64 random hex characters).
5. Before the **first** application start, initialize an **empty** database using `npx prisma db push` and seed the admin with `npm run db:seed`. Run these in a one-off container or an environment with the same DATABASE_URL. Do not routinely run db push on a populated production database.
6. Deploy the application. Visit /login and check /dashboard/maintenance and /dashboard/ad-management.

## Notes
- No production migration history has been committed yet. For future schema updates, generate/review SQL migrations and use `prisma migrate deploy`.
- Maintenance admin API: GET/PUT /api/maintenance (authenticated).
- Android compatibility API: GET /api/settings (public), returning maintenanceMode and maintenanceEndTime (ISO UTC). Verify Android parsing of the date.
- Admin maintenance scheduling is always IST (Asia/Kolkata, UTC+05:30), stored as UTC.
- The Android ad-delivery API, VPN configuration delivery, live analytics and full network SDK integration remain unfinished.
- Before public launch, implement login rate limiting and operational hardening. Set HTTPS, backups and restrict database exposure.
