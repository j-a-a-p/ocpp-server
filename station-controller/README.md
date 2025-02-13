# Charge APT Station Controller

The Station Controller connects the charge stations with their users.

## Setup
Clone the repository
```
cd /usr/local
git clone ...
```

Run from console
``` 
python3 station-controller/main.py
```
Or install and run the service
``` 
sudo systemctl station-controller start 
```

### Dependencies
TODO how to do the python dependencies?
1. **Bluetooth**
   
   Install bluetooth
   
   Run bluetooth
2. **Charge station**
   
   Install OCPPSetTool on mobile. Add the station, and configure the websocket url (with trailing /)

3. **P1 Monitor**
   
   Make sure it is in the USB port that is linked with ```/dev/TODO```


## Interfaces
1. Charge station(s) via [OCPP 1.6](https://openchargealliance.org/protocols/open-charge-point-protocol/)
2. Mobile App via bluetooth
3. Load balancing via P1 (USB)
4. Cloud Manager via Internet
5. Day Ahead Pricing via Internet / Cloud Manager

## Functionality