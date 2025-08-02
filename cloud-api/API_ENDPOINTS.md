# API Endpoints with Reverse Proxy

## Base URLs
- **Production**: `https://apt.aircokopen.nu/api/`
- **Development**: `http://localhost:8000/`

## Available GET Endpoints

### Residents Endpoints

1. **Get all residents** (with pagination)
   ```
   GET https://apt.aircokopen.nu/api/residents/
   GET https://apt.aircokopen.nu/api/residents/?skip=0&limit=100
   GET https://apt.aircokopen.nu/api/residents/?skip=10&limit=50
   ```

2. **Get specific resident by ID**
   ```
   GET https://apt.aircokopen.nu/api/residents/{resident_id}
   GET https://apt.aircokopen.nu/api/residents/1
   GET https://apt.aircokopen.nu/api/residents/123
   ```

3. **Activate resident account with token**
   ```
   GET https://apt.aircokopen.nu/api/residents/activate/{token}
   GET https://apt.aircokopen.nu/api/residents/activate/abc123def456
   ```

### Cards Endpoints

4. **Get all cards** (with pagination)
   ```
   GET https://apt.aircokopen.nu/api/cards/
   GET https://apt.aircokopen.nu/api/cards/?skip=0&limit=100
   GET https://apt.aircokopen.nu/api/cards/?skip=20&limit=25
   ```

5. **Authenticate card by RFID**
   ```
   GET https://apt.aircokopen.nu/api/cards/authenticate/{rfid}?station_id={station_id}
   GET https://apt.aircokopen.nu/api/cards/authenticate/123456789?station_id=station_001
   GET https://apt.aircokopen.nu/api/cards/authenticate/ABC123DEF?station_id=charging_station_1
   ```
   *Note: This endpoint requires an API key in the Authorization header*

6. **Get refused cards** (failed authentications from last 5 minutes)
   ```
   GET https://apt.aircokopen.nu/api/cards/refused
   ```
   *Note: This endpoint requires authentication via cookie*

## Example Usage with curl

```bash
# Get all residents
curl https://apt.aircokopen.nu/api/residents/

# Get specific resident
curl https://apt.aircokopen.nu/api/residents/1

# Get all cards
curl https://apt.aircokopen.nu/api/cards/

# Authenticate card (requires API key)
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://apt.aircokopen.nu/api/cards/authenticate/123456789?station_id=station_001"

# Get refused cards (requires auth cookie)
curl -b "auth_token=YOUR_AUTH_TOKEN" \
     https://apt.aircokopen.nu/api/cards/refused

# Activate account
curl https://apt.aircokopen.nu/api/residents/activate/your_invitation_token
```

## Example Usage with JavaScript/fetch

```javascript
// Get all residents
fetch('https://apt.aircokopen.nu/api/residents/')
  .then(response => response.json())
  .then(data => console.log(data));

// Get specific resident
fetch('https://apt.aircokopen.nu/api/residents/1')
  .then(response => response.json())
  .then(data => console.log(data));

// Authenticate card
fetch('https://apt.aircokopen.nu/api/cards/authenticate/123456789?station_id=station_001', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));

// Get refused cards (with cookie)
fetch('https://apt.aircokopen.nu/api/cards/refused', {
  credentials: 'include' // This sends cookies
})
.then(response => response.json())
.then(data => console.log(data));
```

## Response Formats

### Residents Response
```json
{
  "id": 1,
  "full_name": "John Doe",
  "email": "john@example.com",
  "status": "active",
  "invite_expires_at": null
}
```

### Cards Response
```json
{
  "rfid": "123456789",
  "resident_id": 1
}
```

### Card Authentication Response
```json
{
  "resident_id": 1
}
```

### Refused Cards Response
```json
{
  "refused_cards": [
    {
      "id": 1,
      "rfid": "123456789",
      "station_id": "station_001",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

## Error Responses

### 404 - Not Found
```json
{
  "detail": "Resident not found"
}
```

### 401 - Unauthorized
```json
{
  "detail": "Unauthorized: Missing auth token"
}
```

### 400 - Bad Request
```json
{
  "detail": "Resident is already active"
}
```

## WebSocket Endpoint

For OCPP WebSocket connections:
```
wss://apt.aircokopen.nu/ws
```

## Notes

- All endpoints support CORS for cross-origin requests
- SSL/TLS encryption is enabled for all production endpoints
- API key authentication is required for card authentication endpoints
- Cookie-based authentication is required for refused cards endpoint
- Pagination is supported with `skip` and `limit` parameters 