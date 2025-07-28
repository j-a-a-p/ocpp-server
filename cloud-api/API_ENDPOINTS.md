# API Endpoints with Reverse Proxy

## Base URLs
- **Production**: `https://aircokopen.nu/api/`
- **Development**: `http://localhost:8000/`

## Available GET Endpoints

### Owners Endpoints

1. **Get all owners** (with pagination)
   ```
   GET https://aircokopen.nu/api/owners/
   GET https://aircokopen.nu/api/owners/?skip=0&limit=100
   GET https://aircokopen.nu/api/owners/?skip=10&limit=50
   ```

2. **Get specific owner by ID**
   ```
   GET https://aircokopen.nu/api/owners/{owner_id}
   GET https://aircokopen.nu/api/owners/1
   GET https://aircokopen.nu/api/owners/123
   ```

3. **Activate owner account with token**
   ```
   GET https://aircokopen.nu/api/owners/activate/{token}
   GET https://aircokopen.nu/api/owners/activate/abc123def456
   ```

### Cards Endpoints

4. **Get all cards** (with pagination)
   ```
   GET https://aircokopen.nu/api/cards/
   GET https://aircokopen.nu/api/cards/?skip=0&limit=100
   GET https://aircokopen.nu/api/cards/?skip=20&limit=25
   ```

5. **Authenticate card by RFID**
   ```
   GET https://aircokopen.nu/api/cards/authenticate/{rfid}?station_id={station_id}
   GET https://aircokopen.nu/api/cards/authenticate/123456789?station_id=station_001
   GET https://aircokopen.nu/api/cards/authenticate/ABC123DEF?station_id=charging_station_1
   ```
   *Note: This endpoint requires an API key in the Authorization header*

6. **Get refused cards** (failed authentications from last 5 minutes)
   ```
   GET https://aircokopen.nu/api/cards/refused
   ```
   *Note: This endpoint requires authentication via cookie*

## Example Usage with curl

```bash
# Get all owners
curl https://aircokopen.nu/api/owners/

# Get specific owner
curl https://aircokopen.nu/api/owners/1

# Get all cards
curl https://aircokopen.nu/api/cards/

# Authenticate card (requires API key)
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://aircokopen.nu/api/cards/authenticate/123456789?station_id=station_001"

# Get refused cards (requires auth cookie)
curl -b "auth_token=YOUR_AUTH_TOKEN" \
     https://aircokopen.nu/api/cards/refused

# Activate account
curl https://aircokopen.nu/api/owners/activate/your_invitation_token
```

## Example Usage with JavaScript/fetch

```javascript
// Get all owners
fetch('https://aircokopen.nu/api/owners/')
  .then(response => response.json())
  .then(data => console.log(data));

// Get specific owner
fetch('https://aircokopen.nu/api/owners/1')
  .then(response => response.json())
  .then(data => console.log(data));

// Authenticate card
fetch('https://aircokopen.nu/api/cards/authenticate/123456789?station_id=station_001', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));

// Get refused cards (with cookie)
fetch('https://aircokopen.nu/api/cards/refused', {
  credentials: 'include' // This sends cookies
})
.then(response => response.json())
.then(data => console.log(data));
```

## Response Formats

### Owners Response
```json
{
  "id": 1,
  "full_name": "John Doe",
  "email": "john@example.com",
  "reference": "REF123",
  "status": "active",
  "invite_expires_at": null
}
```

### Cards Response
```json
{
  "rfid": "123456789",
  "owner_id": 1
}
```

### Card Authentication Response
```json
{
  "owner_id": 1
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
  "detail": "Owner not found"
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
  "detail": "Owner is already active"
}
```

## WebSocket Endpoint

For OCPP WebSocket connections:
```
wss://aircokopen.nu/ws
```

## Notes

- All endpoints support CORS for cross-origin requests
- SSL/TLS encryption is enabled for all production endpoints
- API key authentication is required for card authentication endpoints
- Cookie-based authentication is required for refused cards endpoint
- Pagination is supported with `skip` and `limit` parameters 