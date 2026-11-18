# Device bandwidth quotas and gateway enforcement

T2VPN V2 now includes **Users & Devices → Bandwidth & quotas**, modeled after
the requested Device Bandwidth Usage table. It defaults to the current
**calendar date in Asia/Kolkata (IST)**, with a date picker, status filter,
anonymous device ID, measured usage bar, quota status and **Reset Quota** action.

## What is real, what is not

- **Real source:** trusted OpenVPN gateway accounting only. A gateway calls
  `POST /api/telemetry` using its server-side `TELEMETRY_INGEST_SECRET`
  and records `CONNECT` / `HEARTBEAT` / `DISCONNECT`, cumulative
  `bytesIn` and `bytesOut`, its authenticated `installationId`, and
  `sessionId`. The database preserves session totals and accumulates only
  monotonic **deltas** into `DeviceBandwidthDay`. Repeat heartbeats with the
  same counters do not count traffic twice. Concurrent heartbeat updates
  lock the session row.
- **Not a source:** the Android app, downloaded profile, app heartbeat,
  client assertions, estimations or historical guessed traffic.
- **Date attribution:** byte deltas are credited to the IST date on which the
  gateway reports them. To minimize day-boundary errors, report at least
  once every 15–30 seconds, including around midnight IST. This is not an
  exact packet-level timestamp split.
- **No retroactive reconstruction:** the new daily accounting starts once
  the updated gateway collector sends byte counters; earlier sessions may
  have cumulative totals but cannot reliably be split into historical days.
- **Identity caveat:** the current VPN profiles may be shared. A trusted
  OpenVPN server cannot reliably infer a specific installation UUID just from
  a shared username or profile. Configure unique per-installation VPN
  credentials/certificates or an authenticated gateway-to-installation
  mapping before using this feature for *enforcement*. Do not trust IDs sent
  by the Android client as authoritative VPN session attribution.

## Administrator operations

Authenticated endpoint: `GET /api/devices/bandwidth?date=YYYY-MM-DD&status=all&page=1`

Returns only actual daily rows, with anonymous HMAC-derived 16-hex-character
device labels, counted bytes (after any reset), total measured bytes,
configured quota, and a status:
- `normal`: within quota, or a trusted gateway acknowledged removing a limit
- `over_quota`: exceeded daily quota, but gateway enforcement is not enabled
- `pending`: desired gateway shaping/release not acknowledged recently
- `throttled`: *only* when a trusted gateway acknowledges the current policy
  revision and throttle speed within the past 120 seconds

Daily settings: default **2 GiB** and **3 Mbps**, with
`enforcementEnabled: false` on existing installations.
The administrator may update them using authenticated
`PUT /api/devices/bandwidth` with
`{"enforcementEnabled":false,"dailyLimitGiB":2,"throttleMbps":3}`.
This is a backend policy, not yet a configured Linux traffic controller.

**Reset Quota**:
`PATCH /api/devices/bandwidth` with
`{"action":"resetQuota","installationRecordId":"<admin row ID>","date":"YYYY-MM-DD"}`.
Only today's IST date is accepted. This action is CSRF-protected, audited,
and sets a *baseline offset*; measured totals and history remain unchanged.
If the gateway had previously applied a throttle, the UI reports
`RELEASE PENDING` until it acknowledges the new unthrottle policy.
Quota reset does not itself reconfigure a Linux tc rule or terminate a VPN.

## Trusted VPN gateway interface (NOT Android)

The following routes require
`Authorization: Bearer <TELEMETRY_INGEST_SECRET>` with a strong private
collector secret stored only on the OpenVPN gateway and Coolify.
Never embed the token in the APK.

1. `GET /api/telemetry/quota?installationId=<verified installation UUID>`
   returns the current IST date, actual accounted bytes, quota, boolean
   `overQuota`, `action` (`THROTTLE` or `UNTHROTTLE`),
   `targetLimitMbps` (3 or null) and `policyRevision`.
2. The **gateway agent must actually apply/release a 3 Mbps per-device limit**
   for the corresponding authenticated VPN session, using a suitable
   host-specific traffic-control mechanism. Exactly how to do this depends
   on per-device tunnel addressing, Linux qdisc/traffic shaping, VPN process
   model and server topology. Do not apply a global throttle to the entire
   VPN server.
3. Only after successful application, the gateway POSTs
   `/api/telemetry/quota`:
   `{"installationId":"<UUID>","policyRevision":"<from GET>","appliedLimitMbps":3}`
   (use `null` after unthrottling). The backend rejects stale/mismatched
   policy revisions with HTTP 409. The admin UI displays `THROTTLED` only
   for a recently acknowledged matching revision.
4. Poll and reaffirm at least every 30–60 seconds while the installation
   remains connected, and promptly after a quota reset. If the gateway
   disconnects, the report no longer claims the speed is confirmed live
   after 120 seconds.

**Important:** This repository provides the dashboard and authenticated
policy/acknowledgement endpoints; it does **not** contain or deploy a
VPN-server Linux traffic-shaping agent. Leave enforcement disabled in the
admin UI until such an agent is configured and tested end-to-end.

## Persistence and deployment

The new Prisma `DeviceBandwidthDay` table is additive. No existing
`VpnUsageSession`, `AppInstallation`, server credentials, Adfox units, or
subscriptions are deleted or re-created. The existing startup process takes
a verified PostgreSQL backup before `prisma db push`. Preserve
`t2vpn_pgdata`, `t2vpn_secrets` and `t2vpn_backups` volumes and
retain your normal off-server backups. Do not use `prisma migrate reset`
or `prisma db push --accept-data-loss`.

When rolling out: verify the device page shows an *empty* state before
collector telemetry, not manufactured usage; then test a real device's
authenticated VPN identity, cumulative bytes, daily quota crossing, gateway
shaping acknowledgement, quota reset and actual bandwidth recovery.
