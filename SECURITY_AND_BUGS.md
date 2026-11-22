# Security issues and bugs

Tracking list. Tick the box when an item is done and add the commit or PR next to it.
Found by a code review and a dependency audit on 2026-11-22.

Severity: **High** (fix soon, real impact), **Medium** (fix when you touch that area), **Low** (hygiene).

## Open: security

- [ ] **S1 (High) Anyone can connect as a charger.** `wss://<domain>/ws/<any id>` needs no credentials. A fake
  charger can start transactions, fill the refused-cards list and push meter values.
  Fix: HTTP Basic auth per charger (OCPP 1.6 security profile 1 or 2), checked in
  `station-controller/main.py` (`process_request`) or in Apache. Needs the chargers to be configured with the credentials.
- [ ] **S2 (High) Every resident is an admin.** The management endpoints only check "logged in and active":
  `GET/POST /residents`, `POST /residents/{id}/send-invitation`, `POST /charging-costs`, all `/charging-profiles`
  routes, `/charge-transactions/all` and `/power-logs`. The "management" portal is only a different login link.
  Fix: add a role to `residents` (Flyway migration), and a dependency `get_authenticated_admin` for those routes.
- [ ] **S3 (High) `StartTransaction` accepts any `idTag`.** `charge_point.py` returns `accepted` without checking the
  card. Together with S1, a charger can start a session on any resident's card and they pay for it.
  Fix: check `rfid_manager.is_authorized` in `on_start_transaction`, return `invalid` otherwise.
- [ ] **S4 (Medium) The charger can rename itself.** `on_boot_notification` replaces the charger id (from the URL)
  with the serial number from the payload, which the charger chooses. One charger can pose as another.
  Fix: keep the id from the authenticated connection (see S1).
- [ ] **S5 (Medium) `/meter_values.json` and `.csv` are public.** Served from the web root without a login
  (`infra/web/.htaccess`, nginx in Docker). Shows live power use of the building.
  Fix: serve behind the auth cookie, or accept it and document that it is public on purpose.
- [ ] **S6 (Medium) No logout.** There is no logout endpoint or button. The cookie is `HttpOnly`, so the UI cannot
  clear it, and a token stays valid for 180 days (`JWT_EXPIRATION_DAYS`). Stolen cookie = 6 months of access.
  Fix: `POST /auth/logout` that deletes the cookie; shorten the token life; optionally a `token_version` on the
  resident so "log out everywhere" works.
- [ ] **S7 (Medium) Email enumeration through behaviour.** An unknown address answers fast with success; a known one
  sends a mail and, when SES fails, answers 500. The cooldown also answers differently in timing. Measuring that
  reveals who is registered. Fix: always answer 200, send the mail in a background task.
- [ ] **S8 (Medium) Login and invitation tokens are stored in plain text** (`residents.login_token`,
  `invite_token`). Anyone who reads the database (or a backup) can log in as a resident with an unused link.
  Fix: store a SHA-256 hash and compare hashes.
- [ ] **S9 (Medium) Invitations are valid for 180 days** (`INVITE_EXPIRATION_DAYS`). Login links last 1 hour.
  Fix: 7 days is plenty.
- [ ] **S10 (Medium) Services run as `ubuntu`, which has passwordless sudo.** A bug in the API or station controller
  is root on the machine. Fix: a dedicated `ocpp` user and systemd hardening (`NoNewPrivileges`, `ProtectSystem=strict`,
  `PrivateTmp`, `ReadWritePaths` for the data directory) in `infra/create-*-service.sh`.
- [ ] **S11 (Medium) SSH is open to the whole internet** (`ufw allow 22/tcp` in `infra/install-server.sh`). Key-only
  login is the Ubuntu default, but there is no brute-force protection. Fix: `fail2ban`, or limit port 22 to known addresses.
- [ ] **S12 (Low) The email address travels in the URL** (`POST /auth/request-access?email=...`). It ends up in the
  Apache access log. Fix: send it in the request body (both UIs and the API change).
- [ ] **S13 (Low) Personal data in logs.** `ocpp.log` and `cloud-api.log` hold card numbers (RFID) and email
  addresses. Logrotate keeps 4 weeks. Decide on a retention period.
- [ ] **S14 (Low) Backups are unencrypted on the laptop.** `backups/` has the database and the Let's Encrypt
  private key. It is git-ignored, but not encrypted. Fix: encrypt (e.g. `age`) in `deploy-hetzner.sh`/`backup-database.sh`.
- [ ] **S15 (Low) API schema is public.** `/api/openapi.json`, `/api/docs` and `/api/redoc` are reachable by anyone.
  Fix: `FastAPI(docs_url=None, redoc_url=None)` in production (keep `openapi.json`, the deploy script checks it).
- [ ] **S16 (Low) No CSRF token.** Mitigated by `SameSite=Lax` and the CORS rule. Fine as long as no state-changing
  `GET` exists and the site is not embedded. Re-check if cross-site features are added.
- [ ] **S17 (Low) Config errors are silent.** `constants.py` reads the config file without checking it. A missing file
  or missing `JWT_SECRET` only shows up as a 500 on the first login. Fix: fail at startup when `JWT_SECRET`,
  `INVITE_URL` or the SES keys are missing.

## Open: bugs

- [ ] **B1 (High) `on_start_transaction` crashes when the database write fails.** `transaction` is not defined if
  `create_transaction` raises (the `except` only logs), so the next line raises `UnboundLocalError` and the charger
  gets an error instead of an answer. (`station-controller/charge_point.py`)
- [ ] **B2 (Medium) A resident cannot get a new invitation for 180 days.** `send_invitation` refuses while the old
  invitation has not expired. If the mail was lost, there is no way to resend until it expires. Fix: allow a resend
  and replace the token (after the 1-minute cooldown like login mails).
- [ ] **B3 (Medium) Invitation mail failure is hidden.** `POST /residents` returns success when the mail could not be
  sent (`routes/residents.py`, "Don't fail the request"). The admin thinks the resident was invited.
  Fix: return a flag or warning, the UI shows "resident created, mail failed, resend".
- [ ] **B4 (Medium) The API docs describe the wrong auth.** `cloud-api/API_ENDPOINTS.md` says
  `Authorization: Bearer YOUR_API_KEY`, the code needs `X-API-Key`. It also lists no cookie login.
- [ ] **B5 (Low) Region is hardcoded.** `constants.AWS_REGION = "eu-central-1"` ignores `[AWS] REGION` in the config.
- [ ] **B6 (Low) Unused and broken helper.** `constants.load_secret()` is not used and returns `None` for a missing key
  without saying so. Remove it.
- [ ] **B7 (Low) Copy-paste text in `infra/create-cloud-api-service.sh`.** The unit description says "OCPP WebSocket
  Server" and the final message names `ocpp.service`. Cosmetic, but confusing when debugging.
- [ ] **B8 (Low) `datetime.utcnow()` is deprecated** (Python 3.12) and used across the API. Move to
  `datetime.now(timezone.utc)` together with the database column handling, in one change.
- [ ] **B9 (Low) `ProxyPass "/ws"` also matches `/wsanything`.** Use `"/ws/"` in `infra/apt.aircokopen.nu-le-ssl.conf`.

## Dependencies

Checked with `pip-audit` (the exact pins of `cloud-api/requirements.txt` and `station-controller/requirements.txt`) and
`npm audit` / `npm outdated`.

### Python

| Package | Pinned | Latest | Known vulnerabilities | Affects us? | Action |
|---|---|---|---|---|---|
| PyJWT | 2.10.1 | 2.15.1 | 22 advisories (JWKS client, `crit` header, algorithm allow-list, ...) | Mostly not: we only use HS256 with a fixed algorithm list and no JWKS | **Update** |
| starlette (via FastAPI) | 0.47.3 | 1.10.0 | 12 advisories (Range header DoS, Host header, form limits, StaticFiles) | Partly: the Host/path one touches `request.url`. We serve no files or forms | **Update** (needs FastAPI 0.165) |
| fastapi | 0.116.1 | 0.165.0 | none itself, but it pins old starlette | - | **Update** |
| requests | 2.32.4 | 2.34.2 | 1 (`extract_zipped_paths`, predictable temp file) | No | Update (trivial) |
| uvicorn | 0.35.0 | 0.54.0 | none | - | Update with FastAPI |
| boto3 | 1.39.14 | 1.44.9 | none | - | Update, low risk |
| tzdata | 2025.2 | 2026.6 | none | - | Update (timezone rules) |
| websockets | 15.0.1 | 17.4 | none | - | Update; the station-controller tests pass on 17.4 |
| SQLAlchemy | 2.0.41 | 2.1.9 | none | - | **Hold**, minor release with possible changes, no need now |
| ocpp | 2.1.0 | 2.1.0 | none | - | Up to date |

Applied (2026-11-22): `cloud-api/requirements.txt` and `station-controller/requirements.txt` now pin fastapi 0.165.0,
PyJWT 2.15.1, requests 2.34.2, uvicorn 0.54.0, boto3 1.44.9, tzdata 2026.6, websockets 17.4 (starlette comes with
FastAPI, 1.10.0). Result in Docker: cloud-api 134/134 pass, station-controller 26/26 pass, and `pip-audit` reports
no known vulnerabilities on the pins.

The new FastAPI answers a missing `X-API-Key` header with 401 instead of 403. `verify_api_key` now uses
`APIKeyHeader(auto_error=False)` and raises the 403 itself, so the API behaves as documented.

- [x] **D1 (High)** Python pins updated, 401/403 difference fixed.
- [ ] **D2 (Low)** Run `pip-audit` and `npm audit` regularly (a monthly reminder, or a CI job).

### JavaScript (`resident-ui`, `management-ui`)

`npm audit`: **0 vulnerabilities** in both. The only outdated package is `typescript` 5.9.3 -> 7.0.2, a major
version: **hold** until the toolchain (Vite, `typescript-eslint`) supports it.

### Build and server tools (not audited, check by hand)

- [ ] **D3 (Low)** Node 22.12.0 (build only), Flyway 11.10.4, Ubuntu 26.04 image and `python:3.12-slim-bookworm`
  are pinned in `infra/deploy-hetzner.sh` and `docker/Dockerfile`. Check for newer patch releases now and then.
  The server installs OS updates at first boot (`package_upgrade: true`), but there is no automatic update after that:
  check that `unattended-upgrades` is enabled on the VM.

## Done

- [x] Plain `ws://` port 9000 and the API port 8000 now listen on `127.0.0.1` only (`OCPP_BIND_HOST`,
  `API_BIND_HOST`; Docker sets `0.0.0.0`). Chargers use `wss://` through Apache.
- [x] Hardcoded API key `your-secure-api-key` removed. The key is `[Cloud] API_KEY` in the configuration, compared in
  constant time, and refused when not set. `deploy-hetzner.sh` generates it. Redeploy needed on the live server.
- [x] Login cookie: `Secure` when the request came over HTTPS, `SameSite=Lax` on both login cookies.
- [x] Login mails: at most one per minute per address (stops mailbox flooding).
- [x] Apache: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- [x] Login page: the "close this page" button was removed (browsers do not allow it).
- [x] Python dependencies updated to the versions in the table above (D1), no known vulnerabilities left.
