# Running the whole server locally with Docker

One command starts the complete OCPP server on your laptop: the cloud API, the
station controller, both UIs and the database. Two things are mocked so that you
need no accounts and no hardware:

- **Email**: a mock of AWS SES with an inbox page. Login links land there and can be clicked.
- **Charging stations**: simulated OCPP 1.6 chargers that connect to the station controller and charge cars.

A few users are created for you, and they log in through a link, as they do in production.

## Quick start

You need Docker Desktop (with Docker Compose v2) and about 2 GB of disk space for the images.

```bash
docker compose up --build
```

The first build takes a few minutes (it downloads Python packages, Flyway and Node, and builds both UIs).
Add `-d` to run it in the background. When the log goes quiet, open the mock inbox:

> **http://localhost:8025**

Click **Resident portal** or **Management portal** next to a user and you are logged in.

To stop it: `docker compose down`. To stop it **and delete all data** (the next start seeds a fresh database):
`docker compose down -v`.

## Addresses

Everything is published on `localhost` only, so nothing is reachable from other machines on your network.

| What | Address |
| --- | --- |
| Mock inbox, with quick login for the users | http://localhost:8025 |
| Resident portal | http://localhost:8180/resident-ui/ |
| Management portal | http://localhost:8180/management-ui/ |
| Live meter dashboard (the page at `/` in production) | http://localhost:8180/ |
| API (as the UIs call it) | http://localhost:8180/api/ , the schema is at http://localhost:8180/api/openapi.json |
| Charger WebSocket (as a real charger would connect) | `ws://localhost:8180/ws/<station id>`, subprotocol `ocpp1.6` |
| Charger simulator control page | http://localhost:8190 |

The ports can be changed with environment variables (or a `.env` file next to `docker-compose.yml`):
`WEB_PORT` (default 8180), `MAIL_PORT` (8025) and `SIMULATOR_PORT` (8190). Example, in PowerShell:

```powershell
$env:WEB_PORT = "9000"; docker compose up --build
```

The login links in the emails follow `WEB_PORT` automatically.

## The users

| User | Email | Cards |
| --- | --- | --- |
| Alice Anderson | alice@example.com | `04A1B2C3D4E5F6` (Tesla Model 3) |
| Bob Brown | bob@example.com | `04B1B2C3D4E5F7` (Renault Zoe) |
| Carol Clark | carol@example.com | `04C1B2C3D4E5F8` (Nissan Leaf), `04C1B2C3D4E5F9` (visitor card) |

The application has no separate administrator role: every active user can open both the resident portal
and the management portal, exactly as in production.

There are two ways to log in:

1. **Quick login**: on http://localhost:8025 click *Resident portal* or *Management portal* next to a user.
   Behind the scenes it asks the real API for a login email, finds the link in the mock inbox and opens it.
2. **The normal way**: open a portal, type the email address of a user, then open the inbox at
   http://localhost:8025 and click the link in the email. This is the flow production uses.

A login link works once and expires after an hour. Unknown email addresses get the same answer as
known ones and no email, like in production. New residents invited from the management portal receive their
invitation email in the mock inbox too, and its activation link activates the account.

## What is real and what is mocked

| Part | Local setup |
| --- | --- |
| Cloud API (FastAPI) | the real code from `cloud-api/` |
| Station controller (OCPP server) | the real code from `station-controller/` |
| Database | the real SQLite database, with the real Flyway migrations (same Flyway version as production) |
| Python packages | the pinned versions from the `requirements.txt` files, on Python 3.12 |
| UIs | the real code, built for production and served by nginx |
| Reverse proxy | nginx instead of Apache, with the same routes: `/api`, `/ws`, `/management-ui`, `/resident-ui` |
| Email | **mock**: a small SES server, see below |
| Charging stations | **mock**: simulated chargers, see below |
| HTTPS and Let's Encrypt | not used, everything runs over plain HTTP on localhost |
| Passwords and keys | throwaway values in `docker/configuration.ini` |

### The mock email server

The cloud API sends email with AWS SES through boto3. In the local configuration
`SES_ENDPOINT_URL` points boto3 to the `mock-ses` container, which implements the part of the SES API that is
used (`SendEmail`) and shows the mails on http://localhost:8025. The page refreshes by itself.
Messages are kept in memory only, so they are gone after a restart of that container.

`SES_ENDPOINT_URL` is an optional setting in the `[SimpleEmailService]` section. When it is absent, which is
the case in production, the real AWS endpoint is used.

### The mock charging stations

The `chargers` container simulates the stations listed in `docker/dev-data.json` (`ChargeBox-001` with 11 kW and
`ChargeBox-002` with 7.4 kW). They connect through nginx to the station controller, like real chargers, and do
what a charger does: BootNotification, StatusNotification, Heartbeat, and for every card tap Authorize,
StartTransaction, MeterValues every few seconds and StopTransaction.

- **Automatic taps.** Every 20 to 60 seconds a card taps at each station. Mostly it is one of the users' cards;
  now and then it is an unknown card, which the server refuses and records, so the *add card* flow of the
  resident portal can be tried.
- **Time compression.** A session takes a few minutes of real time but represents a few hours of charging: with the
  default `SIM_TIME_SCALE=60` one real second counts as one simulated minute. A session therefore adds a
  realistic amount of energy (about 10 to 40 kWh), but the timestamps in the charts are real, so a session looks
  short on a time axis.
- **By hand.** http://localhost:8190 shows the stations. Click a button to tap a card, tap an unknown card,
  or stop a session.
- **Live data.** While a station charges, the meter dashboard, the *Charger Status* in the management portal and
  the *Station Status* in the resident portal show it.

Settings for the chargers (environment variables, in the shell or a `.env` file):

| Variable | Default | Meaning |
| --- | --- | --- |
| `SIM_AUTO` | `1` | `0` turns the automatic card taps off, so chargers only act when you click |
| `SIM_TIME_SCALE` | `60` | speed of charging: simulated seconds per real second |

More settings (`SIM_METER_INTERVAL`, `SIM_IDLE_MIN`, `SIM_IDLE_MAX`) are described at the top of
`docker/charger_simulator.py`.

You can also point an OCPP test tool to `ws://localhost:8180/ws/<station id>` (subprotocol `ocpp1.6`) to try a
charger of your own. The station controller names a station after the serial number in its BootNotification.

## The data

On the first start the `init` container runs the database migrations and then `docker/seed.py`, which adds:

- the three users with their cards,
- a price of 0.30 per kWh,
- 20 past charging sessions with power measurements, spread over the last two weeks,
- one refused card.

The seed only adds what is missing and only adds history to an empty database, so what you and the simulated
chargers record is never overwritten. The database lives in the Docker volume `ocpp-local_ocpp-data` and
survives `docker compose down`. Use `docker compose down -v` to start from scratch.

To change the users, cards, stations or history, edit `docker/dev-data.json` and start from scratch
(`docker compose down -v`). Card numbers must be upper case.

## Everyday commands

```bash
docker compose up --build -d        # build and start in the background
docker compose ps                   # status of the containers
docker compose logs -f cloud-api    # follow the log of one service (also: station-controller, chargers, mock-ses, web, init)
docker compose up -d --build chargers   # rebuild and restart one service after changing its code
docker compose down                 # stop, keep the data
docker compose down -v              # stop and delete the data
```

Changes to the code of `cloud-api`, `station-controller` or the UIs need a rebuild (`--build`): the images
contain a copy of the code. For work on a UI itself it is quicker to run `npm run dev` in `management-ui` or
`resident-ui`, which talks to the API on `http://localhost:8000`; that port is not published by this setup.

## Services

| Service | Role |
| --- | --- |
| `init` | runs once: Flyway migrations and the seed, then stops |
| `cloud-api` | the cloud API, port 8000 inside Docker |
| `station-controller` | the OCPP server, port 9000 inside Docker |
| `web` | nginx: the UIs, `/api`, `/ws` and the meter dashboard |
| `mock-ses` | mock email server and inbox |
| `chargers` | simulated charging stations |

All Python services use one image, built from `docker/Dockerfile`; the web server is built from
`docker/web.Dockerfile`. The files that belong to this setup:

```
docker-compose.yml           the stack
.dockerignore                keeps secrets and local data out of the images
docker/Dockerfile            Python image: Flyway, pinned packages, both applications
docker/web.Dockerfile        builds both UIs and serves them with nginx
docker/nginx.conf            the routes, the counterpart of the Apache virtual host
docker/configuration.ini     template of the configuration (throwaway values)
docker/dev-data.json         users, cards and stations
docker/seed.py               fills the database
docker/mock_ses.py           mock email server and inbox
docker/charger_simulator.py  simulated charging stations
```

## Troubleshooting

- **A port is already in use** (`ports are not available`). Another program uses 8180, 8025 or 8190. Pick other
  ports with `WEB_PORT`, `MAIL_PORT` and `SIMULATOR_PORT`, see above.
- **The build fails on an ARM computer** (Apple silicon). Flyway is downloaded for x86-64. Build with
  `DOCKER_DEFAULT_PLATFORM=linux/amd64`.
- **A login link says it is invalid or expired.** A link works once. Request a new one, or use the quick login.
- **Activating an invitation does not log you in.** The activation endpoint sets a `Secure` cookie, which
  Chrome, Edge and Firefox accept on `http://localhost`. If your browser refuses it, request a login link instead.
- **The portals load but show no data.** Check `docker compose ps`: `cloud-api` has to be `healthy`. Look in
  `docker compose logs init cloud-api` for migration errors.
- **The charger status says nothing is happening.** Look at the simulator page (http://localhost:8190). A station
  that says *Disconnected* reconnects by itself; see `docker compose logs chargers station-controller`.

## Known issue in the station controller

When a charger presents an unknown card, `station-controller/charge_point.py` answers with
`AuthorizationStatus.rejected`, which does not exist in OCPP 1.6 (the valid refusal is `invalid`). The
server then logs an `AttributeError` and sends an internal error to the charger instead of a refusal. The card
is still recorded as refused first, so the *add card* flow works, and the simulated chargers treat the error as
a refusal. The same code runs in production. Changing `AuthorizationStatus.rejected` to
`AuthorizationStatus.invalid` fixes it; this setup leaves the application code as it is.
