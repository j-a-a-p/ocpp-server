# Charge APT user app

The user app allow local users to manage their chargers.

### Persona's
1. **Apartment admin** - in stand alone mode.
   Responsible for billing, maintenace (doing backups) and user management.
2. **Resident**
   User of charging stations. Manages their RFID tags, charging mode and reviews their own charging history.

### Modes
1. **Stand alone**
   The charging network is not connected to the Internet. Access is only possible at bluetooth distance, appr. 10 meters. The app will support an admin role
2. **Cloud**
   Management is centralized, via for example the Home Owner's Association (HOA). The app will therefor not support the admin persona, as it is managed via de Cloud web application.

### Technology
1. The app connects with the charge manager via bluetooth.
2. The app uses NFC to manage access cards.

### Security
In stand alone mode the Charger Manager holds the key, with the public key printed on the box. When engaging the app for the admin persona the public key has to be provided.
In cloud mode, the keys are managed in the cloud.

# Functions

## Admin functions
### Admin onboarding
### Invite new resident
### Remove resident
### Charging history
#### Download in Excel
#### Invite to pay

## Resident functions
### Add RFID tag
### Remove tag
### Ask to join
### Charging history
### Set charging mode to fast or economy