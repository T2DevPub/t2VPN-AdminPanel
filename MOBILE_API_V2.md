# T2VPN Android ↔ Admin Panel V2: API contract

Target: `https://vpn2.t2dev.in` · Android package: `app.t2dev.vpn`.

**This backend runs separately from the Kotlin app.** Mobile clients must never use the admin session/cookie routes or copy a backend secret into the APK.

## Required deployment configuration (Coolify Docker Compose)

Required existing: `ADMIN_USERNAME`, `ADMIN_PASSWORD` (12+ characters), `AUTH_SECRET` (32+ random characters).

New optional:
- `MOBILE_PROVISIONING_ENABLED=false`: set `true` only when OpenVPN user credential exposure risks and Android flow have been reviewed. This gate affects **profile delivery**, not public server discovery.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64`: base64-encoded Google Play API service account JSON **stored only in Coolify**, service account must have subscription read access.
- `PLAY_PLUS_PRODUCT_IDS`: comma-separated verified Google Play Plus subscription product IDs, matching Play Console.
- `TELEMETRY_INGEST_SECRET`: random 32+ character secret held by **trusted VPN gateways or collector only**; never in APK.

These variables are forwarded to the app container through `docker-compose.yml`. No `DATABASE_URL` needs to be entered in Coolify Compose. Preserve `t2vpn_pgdata` and `t2vpn_secrets` volumes.

## Public APIs

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Readiness / database health |
| GET | `/api/mobile/servers` | Enabled VPN server metadata, **not profiles** |
| GET | `/api/mobile/ads?country=RU` | Eight ad placements with country override, primary/fallback |
| GET | `/api/mobile/config` | Existing remote App Control JSON |
| GET | `/api/settings` | Existing maintenance controls |

`GET /api/mobile/servers` returns `{schemaVersion:2,servers:[{id,name,country,countryCode,city,host,ipAddress,enabled,tier,isPlusOnly,profiles:[{slot,protocol,port}],requiresAuthorization}]}`.
Read only V2 PostgreSQL. Disabled servers do not appear; no V1 fallback or fake/demo server data. If no server exists in the V2 dashboard, the array is empty.

`GET /api/mobile/ads` returns `{schemaVersion:2,adsEnabled,providers,rewardedUnlockEnabled,appOpenCooldownMinutes,placements:[{key,enabled,primary:{provider,format,unitId}|null,fallback:{provider,format,unitId}|null}]}`. Available placement keys:
`app_open`, `home_banner`, `usage_banner`, `region_native`, `rewarded_unlock`, `connect_interstitial`, `disconnect_interstitial`, `free_server_interstitial`.
A field being configured does **not** guarantee that the Android client has the matching ad SDK; avoid activating unsupported providers or formats.

## Android installation authentication

Android **generates** a persistent EC P-256 signing key pair in Android Keystore (`SHA256withECDSA`). Never transmit the private key.

1. Generate a random installation UUID and persist it with the Keystore key alias.
2. POST `/api/mobile/auth/challenge` with
   `{"installationId":"<UUID>","publicKeySpki":"<base64 X.509 SubjectPublicKeyInfo bytes>"}`.
3. API returns `{schemaVersion,challengeId,nonce,signingPayload,expiresAt}`.
4. Sign **exact UTF-8 bytes** of `signingPayload` with `SHA256withECDSA`, return DER-encoded signature as standard Base64.
5. POST `/api/mobile/auth/token` with
   `{"installationId":"<UUID>","challengeId":"<UUID>","signature":"<base64 DER ECDSA signature>"}`.
6. API returns a short-lived `accessToken` (900 seconds). Send `Authorization: Bearer <accessToken>` for protected mobile routes; re-challenge after token expiry.

The server binds the public key to its installation record; previously registered keys cannot be silently replaced. Device key proof is **not equivalent to hardware attestation or Play Integrity**. A new untrusted installation gets **Free-only** access; a client-provided Plus flag is never accepted.

## Authenticated mobile APIs

| Method | Route | Input / result |
| --- | --- | --- |
| GET | `/api/mobile/me` | Verified Plus/reward status; current expiry times |
| POST | `/api/mobile/connect` | `{"serverId":"<V2 server cuid>"}`; authorized OpenVPN profile / credentials |
| POST | `/api/mobile/subscription/verify` | `{"purchaseToken":"<Play Billing token>"}`; checks Google Play Developer API, returns verified expiry |
| POST | `/api/mobile/reward/prepare` | Returns `customData` nonce and SSV callback URL |
| POST | `/api/mobile/reward/verify` | Polls **backend-verified** reward status; **never grants** from client assertion |
| POST | `/api/mobile/events` | `{"event":"INSTALL|OPEN|CONNECTION_ATTEMPT|CONNECTION_FAILED", "deviceModel"?:...,"countryCode"?:...}` |

Every authenticated route requires the device JWT obtained above. All credential/entitlement replies use `Cache-Control: no-store`.

### VPN profile routing and access

The `POST /api/mobile/connect` endpoint refuses all requests when `MOBILE_PROVISIONING_ENABLED` is not `true`. It fetches **encrypted server profiles** from Prisma and decrypts only after checking installation identity and entitlement.

| Server tier | Client entitlement | Profile |
| --- | --- | --- |
| Free | Free | Config 2 if present, else Config 1 |
| Free | Verified paid Plus | Config 1 |
| Free | Verified reward only | Config 2 if present, else Config 1 |
| Plus | Free | HTTP 403 |
| Plus | Verified paid Plus | Config 1 |
| Plus | Verified reward within 30 minutes | Config 1 |

Response: `{schemaVersion,serverId,countryCode,slot,protocol,port,host,ovpnConfig,username,password,issuedAt,cacheSeconds:0,telemetryMode:'trusted-gateway-only'}`.

**Credential limitation:** V2 currently stores administrator-uploaded, potentially shared OpenVPN profiles. A client who receives such a profile can copy it after delivery. TLS, device-key authentication and `no-store` do **not** make shared credentials non-transferable and do **not** force server-side VPN revocation. Before operating Plus access at scale, migrate VPN servers to per-installation expiring credentials backed by OpenVPN/RADIUS (or another server-side entitlement check), rotate leaked shared credentials, and integrate certificate/key revocation. Keep provisioning off until this is acceptable.

### Verified Plus subscription

Requires the Google Play service account and `PLAY_PLUS_PRODUCT_IDS` in Coolify. Calls `purchases.subscriptionsv2.get` for package `app.t2dev.vpn`, checks subscription state, current line-item expiry and product allowlist; stores a keyed hash of the purchase token to prevent binding the same token to a second installation. The backend checks that verification is recent (15 minutes) before allowing paid Plus connection, so call verification again when `/api/mobile/me` reports refresh required. The service account must never be embedded in Android. Samsung and other stores need their own **server-side verified** billing adapters before enabling Plus on those releases.

### Verified 30-minute rewarded access

Ad management must enable `rewardedUnlockEnabled` and an AdMob/AdX rewarded ad unit. Android requests `POST /api/mobile/reward/prepare` and uses the returned UUID as `ServerSideVerificationOptions.customData` **before showing** the ad (also set userId to installation UUID). Configure the AdMob SSV callback URL in the AdMob rewarded unit:

`https://vpn2.t2dev.in/api/mobile/reward/ssv`

Google calls the URL with signed query parameters. V2 verifies the original ECDSA-signed query using rotated keys from Google's AdMob key server, validates timestamp, transaction ID, reward nonce and allowed ad unit, applies replay protection, then grants 30 minutes. App should poll `POST /api/mobile/reward/verify` until confirmed. No client-only callback can set Plus entitlement. Non-AdMob rewarded providers require their own documented SSV adapter.

## Trusted VPN accounting: never send its secret from Android

`POST /api/telemetry` accepts a **gateway-to-backend** bearer token stored on your OpenVPN gateway/collector. Schema:
```json
{"installationId":"uuid","serverId":"configured-server-id","event":"CONNECT"}
```
When the VPN gateway confirms the tunnel is established, send CONNECT and capture returned `sessionId`. Send `HEARTBEAT` every 15–30 seconds with that session ID and cumulative, actual `bytesIn`/`bytesOut` measured by the VPN gateway. Send DISCONNECT with the final totals. A heartbeat in the last 60 seconds counts as a *recently reported* active session; no fabricated bandwidth is generated. The Android `/api/mobile/events` endpoint accepts only non-authoritative basic app events.

Google Play Billing, AdMob SSV, telemetry gateway authentication and VPN server RADIUS integration require **external service configuration**. A successful Next.js build does not prove those systems are connected.

## Rollout checklist

1. Back up the database and secrets volumes before redeploying Coolify from `main`.
2. Verify `GET /api/health` returns 200 and the public V2 server directory returns the records you actually entered.
3. Add at least one real encrypted .ovpn profile in the V2 Admin Panel. Do **not** import old exposed shared secrets unchanged.
4. Configure Google Play and AdMob SSV service settings, if used.
5. Implement the Android Keystore auth and server flow above; test against V2 in a debug build.
6. Enable `MOBILE_PROVISIONING_ENABLED=true` only when ready for authorized profile distribution; this requires a Coolify redeploy.
7. Verify both Free and Plus routing, rewarded 30-minute expiration, maintenance, country ad settings, consent, reconnect, and device diagnostics.
8. Test a complete VPN handshake. Dashboard live usage requires a trusted VPN gateway collector; Android telemetry alone will not populate network bandwidth.
9. Publish a staged Android release before switching all production users. Do **not** bundle `TELEMETRY_INGEST_SECRET`, `AUTH_SECRET` or Google service account credentials in the APK.

## Yandex Advertising Network: all five mobile ad unit formats

The admin UI's `Yandex Ads / Adfox` provider is encoded as `ADFOX` in the
existing Android API contract to avoid breaking clients. Under
**Ad Management → Ad unit IDs**, the "Yandex ad units · Quick add" section can
store all five Yandex Advertising Network ad formats:

- `APP_OPEN` — for `app_open` placement
- `REWARDED` — inventory record only (do not assign to verified Plus unlock)
- `INTERSTITIAL` — for connection, disconnection or free-server interstitials
- `NATIVE` — for region selection
- `BANNER` — for home and usage statistics

Unit IDs use the `R-M-<page>-<block>` format and are **stored in PostgreSQL**,
not in GitHub source. Existing ad units are not overwritten by Quick add;
you may enter fewer than five IDs and add remaining formats later. After
adding, choose the actual placement assignments and click **Save changes**.

**Yandex versus Adfox:** Yandex Mobile Ads SDK supports all five mobile
formats, but Adfox *direct sales* applies only to Banner, Native and
Interstitial. App Open and Rewarded use eligible Yandex Advertising Network
inventory; they are not direct-sales Adfox formats.

**Secure rewarded Plus restriction:** Yandex Mobile Ads does not support
server-side reward verification. This backend only authorizes T2VPN's
30-minute Plus unlock through Google rewarded SSV. Yandex Rewarded units may
be stored in the library but cannot be selected for the `rewarded_unlock`
placement or country override, and `/api/mobile/ads` filters out any older
unsupported Yandex reward assignment.

Yandex App Open is supported in backend placement configuration, but Android
must actually implement `ADFOX` + `APP_OPEN` through the Yandex
`AppOpenAdLoader` / associated documented lifecycle API. Older Android
builds may still force Google as their App Open provider. Updating backend
settings does **not** update deployed Android applications.

Yandex documentation:
- https://ads.yandex.com/helpcenter/en/dev/android/app-open-ad
- https://ads.yandex.com/helpcenter/en/dev/android/rewarded
- https://ads.yandex.com/helpcenter/en/monetization/adfox/connection
- https://ads.yandex.com/helpcenter/en/support/faq/sdk-integration

## Countries, Today defaults, app presence and Android server labels

The mobile server directory now includes `name` as the **country name**,
`countryName`, `countryFlag`, and `locationLabel` (country + city).
The old administrator-entered server name is preserved in `displayName`.
Keep using `id` for selection and provisioning. Android should display
`countryFlag + countryName` as the main server-country line and city as
the secondary line, grouping multiple servers under the same country.
Do not treat the custom `displayName` as the country name.

The V2 dashboard now defaults to **Today (midnight–now in Asia/Kolkata)** and
refreshes visible pages every 15 seconds. Analytics can still be filtered to
Yesterday / 7 / 30 / 90 days / lifetime where available.

A privacy-conscious, authenticated mobile app can optionally POST
`/api/mobile/events` with `{"event":"APP_HEARTBEAT","countryCode":"IN"}`
about every 30–45 seconds while in foreground. This updates
`AppInstallation.lastSeenAt` but does not create a session record.
The dashboard then shows a distinct “App active now (60s)” count. Android
must implement that heartbeat before this metric becomes meaningful.
Never interpret a phone/app heartbeat as an established VPN tunnel.

**Actual VPN live sessions and bytes require trusted VPN server/gateway
telemetry** through `POST /api/telemetry`. That endpoint remains secret-protected
and the token must never be included in Android. If no gateway collector is
connected, trusted connection and bandwidth counts are not estimated.
