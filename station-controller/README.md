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
This will start the WebSocket server on `ws://0.0.0.0:9000`.

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

### Testing the Database
To test the database functionality:
```bash
python3 test_db.py
```

## Functionality