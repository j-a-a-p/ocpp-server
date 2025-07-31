# Management UI

This is the management portal for the OCPP charging station system. It provides administrative functions for managing residents and charging stations.

## Authentication

The management UI uses the same authentication system as the resident UI, but with a different flow parameter. Users can access both the resident portal and management portal using the same email address.

### Authentication Flow

1. **Email-based Login**: Users enter their email address in a popup that appears when they're not authenticated
2. **Email Link**: A login link is sent to their email with a token
3. **Token-based Login**: Clicking the link logs them in automatically
4. **Session Management**: Authentication is maintained via HTTP-only cookies

### Flow Parameter

The system supports two authentication flows:
- `resident`: For the resident portal (default)
- `management`: For the management portal

The flow parameter is included in the email links to direct users to the appropriate UI.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Features

- **Resident Management**: Add, edit, and view residents
- **Authentication**: Secure email-based authentication
- **Responsive Design**: Works on desktop and mobile devices

## API Endpoints

The management UI communicates with the cloud API for:
- Authentication (`/auth/request-access`, `/auth/login/{token}`, `/auth/validate`)
- Resident management (`/residents/`)

## Security

- Uses HTTP-only cookies for session management
- Email-based authentication with time-limited tokens
- Same user base as resident portal with different access levels
