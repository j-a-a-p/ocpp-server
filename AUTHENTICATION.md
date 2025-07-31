# Authentication System Documentation

This document explains how authentication works in the OCPP charging station system, which supports both resident and management access for the same user base.

## Overview

The system uses a **shared user base** where the same users can access both the resident portal and management portal using their email address. The authentication flow is determined by a `flow` parameter that directs users to the appropriate interface.

## Authentication Flow

### 1. Email-Based Login

Both resident-ui and management-ui use the same email-based authentication system:

1. **User visits portal** → Not authenticated
2. **AuthPopup appears** → User enters email address
3. **Email sent** → Login link with token sent to user's email
4. **User clicks link** → Redirected to appropriate login page
5. **Token processed** → User authenticated and session established

### 2. Flow Parameter

The system supports two authentication flows:

- **`resident`** (default): Directs users to the resident portal
- **`management`**: Directs users to the management portal

The flow parameter is included in the email links to ensure users are directed to the correct interface.

## Authentication Mechanics

### Backend Authentication

#### Token Types

1. **Login Tokens**: Used for email-based authentication
   - Generated when user requests access
   - 1-hour expiration
   - Single-use (cleared after login)

2. **Auth Tokens**: Used for session management
   - JWT-based with 180-day expiration
   - Stored as HTTP-only cookie
   - Validated on every protected request

3. **Invitation Tokens**: Used for account activation
   - 180-day expiration
   - Single-use for account activation

#### Authentication Check Pattern

```python
# Standard authentication check for protected endpoints
if not auth_token:
    raise HTTPException(status_code=401, detail="Missing auth token")

resident_id = verify_auth_token(auth_token)
if not resident_id:
    raise HTTPException(status_code=401, detail="Invalid auth token")
```

### Frontend Authentication

#### Session Management

- **HTTP-Only Cookies**: Prevents XSS attacks
- **Automatic Inclusion**: `credentials: 'include'` sends cookies with requests
- **Cross-Origin Support**: Proper CORS configuration for credentials

#### API Call Pattern

```typescript
// Standard API call with authentication
const response = await fetch(`${API_BASE_URL}/endpoint`, {
  credentials: 'include', // Sends auth_token cookie automatically
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});
```

### Email System

#### Email Link Generation

The system generates different login links based on the flow parameter:

```python
# Email link generation logic
if flow == "management":
    login_link = f"{base_url}/management-ui/login?token={token}"
    subject = "Login to Management Portal"
else:
    login_link = f"{base_url}/resident-ui/login?token={token}"
    subject = "Login to Resident Portal"
```

#### Email Content

Different email subjects and content for each flow to provide clear context to users about which portal they're accessing.

## Security Features

### Token Security

- **Login Tokens**: 1-hour expiration for email links
- **Auth Tokens**: 180-day expiration (JWT)
- **Invitation Tokens**: 180-day expiration for account activation

### Cookie Security

- **HTTP-Only**: Prevents XSS attacks
- **Secure**: HTTPS only (in production)
- **SameSite**: Strict policy for CSRF protection

### API Security

- **API Keys**: For system-to-system communication (station controllers)
- **Cookie Authentication**: For user sessions
- **Token Validation**: JWT-based with expiration checking

## User Access Levels

### Resident Access
- Access to resident-specific endpoints
- View own data (cards, transactions)
- Register refused cards

### Management Access
- Access to management-specific endpoints
- View all system data
- Administrative functions

## Implementation Details

### Backend Authentication Check

```python
# Example authentication check
if not auth_token:
    raise HTTPException(status_code=401, detail="Missing auth token")

resident_id = verify_auth_token(auth_token)
if not resident_id:
    raise HTTPException(status_code=401, detail="Invalid auth token")
```

### Frontend API Calls

```typescript
// Example API call with authentication
const response = await fetch(`${API_BASE_URL}/residents/`, {
  credentials: 'include', // Sends auth_token cookie
});
```

### Email Generation

```python
# Example email link generation
if flow == "management":
    login_link = f"{base_url}/management-ui/login?token={token}"
else:
    login_link = f"{base_url}/resident-ui/login?token={token}"
```

## Configuration

### Environment Variables

- `VITE_API_BASE_URL`: API base URL for frontend
- `JWT_SECRET`: Secret key for JWT tokens
- `INVITE_URL`: Base URL for email links

### Database Schema

- `residents` table stores user information
- `login_token` and `login_expires_at` for email authentication
- `auth_token` stored as HTTP-only cookie

## Troubleshooting

### Common Issues

1. **Email links not working**: Check `INVITE_URL` configuration
2. **Authentication failing**: Verify JWT secret and token expiration
3. **CORS issues**: Ensure proper CORS configuration for credentials
4. **Cookie not set**: Check cookie domain and secure settings

### Debug Steps

1. Check browser network tab for authentication requests
2. Verify cookie is being sent with requests
3. Check server logs for authentication errors
4. Validate JWT token format and expiration

## Best Practices

1. **Never expose authentication tokens** in client-side code
2. **Use HTTP-only cookies** for session management
3. **Implement proper CORS** for cross-origin requests
4. **Validate tokens** on every protected endpoint
5. **Log authentication events** for security monitoring
6. **Use HTTPS** in production for secure cookie transmission 