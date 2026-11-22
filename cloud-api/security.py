import secrets

from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader

import constants

# auto_error=False: newer FastAPI answers a missing header with 401. We keep the documented 403.
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(api_key: str | None = Security(api_key_header)):
    """The key comes from the configuration file. Without one, nobody gets in."""
    expected = constants.API_KEY
    if not expected or not api_key or not secrets.compare_digest(api_key.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key


def request_is_https(request: Request) -> bool:
    """True when the browser talked HTTPS, also behind the Apache/nginx proxy that ends the TLS."""
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    return (forwarded or request.url.scheme) == "https"
