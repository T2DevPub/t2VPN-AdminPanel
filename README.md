# T2VPN Admin Control Center
Next.js 15 / React 19 / TypeScript / Tailwind 4 / Prisma / PostgreSQL starter for T2VPN. Design follows the T2Dev AdX login styling.

## Implemented
- Authenticated admin login (bcrypt password hashes, signed HttpOnly session cookies, protected dashboard routes)
- Header navigation and responsive overview (no fabricated analytics)
- CRUD API for VPN server configurations with server Free/Plus classification controlled by backend
- Audit entries for server configuration changes

## Setup
1. Copy `.env.example` to `.env` and set PostgreSQL `DATABASE_URL`, a cryptographically random `AUTH_SECRET` (32+ chars), and strong `ADMIN_USERNAME`/`ADMIN_PASSWORD` (12+ chars).
2. Run `npm install`, `npx prisma db push`, `npm run db:seed`, `npm run dev`.
3. Visit `http://localhost:3000/login`. Do not expose the service publicly before adding login rate limiting, CSRF/origin protections, HTTPS and operational hardening.
4. For production, create and commit a Prisma migration and deploy using `prisma migrate deploy` before `next start`. The production start script intentionally does not apply database changes automatically.

## Integration status
- Implemented: encrypted OpenVPN profile CRUD (including replacement), Free/Plus routing metadata, public **metadata-only** server directory, remote advertising APIs, authenticated trusted telemetry ingestion, recent-heartbeat live connection counts, per-server measured traffic reporting, date filters, V2 network traffic UI, and remote maintenance controls.
- **External integration still required:** A trusted VPN gateway collector must send CONNECT/HEARTBEAT/DISCONNECT with cumulative network counters and capture the returned session ID. Android must implement authenticated VPN profile delivery and validate paid/rewarded entitlements; anonymous profile secrets are intentionally unavailable. Ads must be consumed via `/api/mobile/ads` by Android provider SDK integrations. GAMOB earnings, Play Billing verification and server-side throttling remain separate tasks.
- No fabricated traffic data. Historic metrics cannot be backfilled from the legacy application's estimated bandwidth counter.

## Important
The old standalone `index.html` is a design prototype, not the production Next.js login. The real login is at `src/app/login/page.tsx`. Do not use `index.html` for deployment. Do not store VPN secrets or GAMOB credentials in the browser. Authentication currently has no login rate limiting; add it before internet exposure.

## Legacy Express dashboard feature migration

See [COOLIFY.md](COOLIFY.md) for the API contracts and safe release sequence. This V2 repository keeps its Next.js + PostgreSQL architecture and **does not copy** public SQLite files, plaintext credentials, or legacy unauthenticated server-secret endpoints. Never publish or re-use leaked VPN credentials from old Git history.
