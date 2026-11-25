from starlette.requests import Request

from app.core.config import settings


def client_ip(request: Request) -> str:
    """The real visitor IP, used for rate limiting and audit logs.

    Behind DigitalOcean's load balancer every connection comes from the
    balancer itself, so the platform's own client-IP header is used when
    configured (CLIENT_IP_HEADER). X-Forwarded-For is never trusted
    blindly: a visitor can put anything in it."""
    header = settings.CLIENT_IP_HEADER.strip().lower()
    if header:
        value = request.headers.get(header)
        if value:
            parts = [p.strip() for p in value.split(",") if p.strip()]
            if parts:
                # For X-Forwarded-For style lists the entry appended by the
                # trusted proxy is the right-most one.
                return parts[-1]
    return request.client.host if request.client else "unknown"
