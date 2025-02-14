# How Multiple Charging Stations Connect via WebSocket

When you have multiple charging stations, each one will establish its own WebSocket connection with the Central System (CSMS). The OCPP protocol (e.g., OCPP 1.6, 2.0.1) is designed to handle multiple simultaneous connections efficiently.

## 1️⃣ WebSocket Connections for Each Charging Station

Each charging station is treated as a client that opens a WebSocket connection to the CSMS. The CSMS acts as a server that listens for these incoming connections.

How it works:
1.	A charging station starts up and attempts to connect to the CSMS via WebSocket (ws:// or wss://).
2.	The CSMS accepts the connection and assigns an instance of the ChargePoint class to handle messages.
3.	Each station is uniquely identified by its charge_point_id (usually the serial number or an ID configured in the station).
4.	Multiple connections are managed in parallel, so each station gets its own ChargePoint instance.

## 2️⃣ WebSocket Connection Flow for Multiple Stations

Let’s assume you have three charging stations with IDs:
- station_001
- station_002
- station_003

Each one initiates a WebSocket connection.

### Step-by-Step Flow

#### 1️⃣ Charging Station 1 connects
- WebSocket connection is established:
ws://csms.example.com/station_001
- CSMS assigns a new ChargePoint instance to handle this connection.

#### 2️⃣ Charging Station 2 connects
- WebSocket connection is established:
ws://csms.example.com/station_002
- Another ChargePoint instance is created for this station.

#### 3️⃣ Charging Station 3 connects
- WebSocket connection is established:
ws://csms.example.com/station_003
- Yet another ChargePoint instance is created.

Since each connection is handled separately, the CSMS can interact with multiple stations simultaneously.

## 3️⃣ Handling Connections in the CSMS

The CSMS needs to maintain a list of active connections. In an async WebSocket server, you typically do something like this:

```
import asyncio
import websockets
from ocpp.v16 import ChargePoint as BaseChargePoint

connected_charge_points = {}  # Store active charge points

async def on_new_connection(websocket, path):
    """ Handles new WebSocket connections from charge points. """
    charge_point_id = path.strip("/")  # Extract station ID from the path

    cp = ChargePoint(charge_point_id, websocket)
    connected_charge_points[charge_point_id] = cp  # Store instance

    logging.info(f"New connection from {charge_point_id}")

    # Start listening for messages from this charge point
    await cp.start()
```

### Start the WebSocket server
start_server = websockets.serve(on_new_connection, "0.0.0.0", 9000)
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()

## 4️⃣ What Happens Internally
-	When a new WebSocket connection is established, the on_new_connection function is triggered.
-	The charge_point_id is extracted from the WebSocket URL path.
-	A new instance of ChargePoint is created for this station.
-	This instance is stored in connected_charge_points, so we can reference it later.
-	The ChargePoint.start() method continuously listens for OCPP messages from that station.

## 5️⃣ Multiple ChargePoint Instances

Since each station has its own ChargePoint instance, they work independently:
```
connected_charge_points = {
    "station_001": <ChargePoint instance for station_001>,
    "station_002": <ChargePoint instance for station_002>,
    "station_003": <ChargePoint instance for station_003>,
}
```
Each instance has its own state and handles its own messages.

## 6️⃣ Handling Messages from Multiple Stations

Since each ChargePoint instance handles events like StartTransaction, StopTransaction, etc., you can now differentiate between stations:
```
@on("StartTransaction")
async def on_start_transaction(self, connector_id, id_tag, meter_start, timestamp, **kwargs):
    station_serial = self.station_info.get("serial", self.id)
    logging.info(f"StartTransaction received from {station_serial}")

    # Process transaction independently for this station
```
Each event logs the station’s serial number, making it clear which charge point is sending the data.

## 7️⃣ What Happens When a Station Disconnects?

If a station loses connection (e.g., network issue or power loss):
1.	The WebSocket connection closes.
2.	The ChargePoint instance is removed from connected_charge_points.
3.	When the station reconnects, a new instance is created.

You can detect disconnections using:
```
async def on_new_connection(websocket, path):
    try:
        cp = ChargePoint(charge_point_id, websocket)
        connected_charge_points[charge_point_id] = cp
        await cp.start()
    except websockets.exceptions.ConnectionClosed:
        logging.warning(f"Charge point {charge_point_id} disconnected")
        connected_charge_points.pop(charge_point_id, None)  # Remove from active list
```
## 🔹 Summary

✅ Each charging station establishes its own WebSocket connection.
✅ The CSMS manages multiple WebSocket connections in parallel.
✅ Each station gets its own ChargePoint instance (acting independently).
✅ When a station disconnects, it’s removed from the active list and can reconnect later.

This approach scales well for managing hundreds of charging stations at once. 🚀🔌