# Charge APT Station Controller

The Station Controller connects the charge stations with their users.

## Setup
Clone the repository
```
git clone <repo-url>
cd ocpp-server/station-controller
```

## Install Python Dependencies
Install the required Python packages:
```bash
pip3 install -r requirements.txt
```

## Running the Station Controller
Run from console:
```bash
python3 main.py
```
This will start the WebSocket server on `ws://127.0.0.1:9000`. That port is plain `ws://` and by default only
reachable from the machine itself.

On the server the chargers connect to it directly, with `ws://<domain>:9000/<station id>`: the systemd service sets
`OCPP_BIND_HOST=0.0.0.0` and the firewall opens port 9000 (`infra/install-server.sh`). Nothing is encrypted that way,
see S18 in `SECURITY_AND_BUGS.md`. The encrypted way is still there: `wss://<domain>/ws/<station id>`, where Apache ends
the TLS and passes the connection on. Docker also sets `OCPP_BIND_HOST=0.0.0.0`, there the web server is another container.

Every connection is logged with the address of the charger (`New ChargePoint connected: <id> from <address>`): its own
address and port when it connects straight, or the address that Apache saw when it comes through the web server.

## System Dependencies
1. **Bluetooth**
   - Install and enable Bluetooth if required for your hardware.
2. **Charge station**
   - Install OCPPSetTool on mobile. Add the station, and configure the websocket url (with trailing /)
3. **P1 Monitor**
   - Make sure it is in the USB port that is linked with `/dev/TODO`

## Interfaces
1. Charge station(s) via [OCPP 1.6](https://openchargealliance.org/protocols/open-charge-point-protocol/)
2. Mobile App via bluetooth
3. Load balancing via P1 (USB)
4. Cloud Manager via Internet
5. Day Ahead Pricing via Internet / Cloud Manager

## Database
The station controller uses SQLite to store charge transactions. The database file `charge_transactions.db` is automatically created when the application starts.

### Database Schema
- **charge_transactions** table:
  - `id`: Primary key (auto-increment)
  - `station_name`: Name of the charging station
  - `rfid`: RFID tag used for the transaction
  - `created`: Timestamp when the transaction was created

### Station connections
Every charger keeps one WebSocket open. The controller writes a row to `station_connections` when a charger
connects, moves `last_seen_at` along with its heartbeats (every 30 seconds), and fills `disconnected_at` when the
connection ends. When the controller starts it closes the rows that a previous run left open. The management portal
reads this for its **Stations** page (`GET /stations/` of the cloud API): who is online now, the uptime and a
timeline. A connection that has not been heard for 2 minutes does not count as online, whatever the row says.
Problems writing these rows are logged and ignored, they never keep a charger from charging.

### Testing the Database
To test the database functionality:
```bash
python3 test_db.py
```

## Functionality