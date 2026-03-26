import os
from typing import Any

try:
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token
except ImportError:  # pragma: no cover - handled at runtime when dependency is missing
    Request = None
    id_token = None


DEFAULT_ALLOWED_GOOGLE_DOMAINS = (
    "menascouae.com",
    "menascoadmin.com",
    "menascoksa.com",
)
DEFAULT_GOOGLE_CLIENT_ID = "617455632614-lpu5pdcl5rbmoiq77spd7dmc1cvhgkl8.apps.googleusercontent.com"


class GoogleAuthError(Exception):
    pass


def get_google_client_id() -> str:
    return os.getenv("GOOGLE_CLIENT_ID", DEFAULT_GOOGLE_CLIENT_ID).strip()


def get_allowed_google_domains() -> set[str]:
    configured_domains = os.getenv(
        "ALLOWED_GOOGLE_DOMAINS",
        ",".join(DEFAULT_ALLOWED_GOOGLE_DOMAINS),
    )
    return {
        domain.strip().lower()
        for domain in configured_domains.split(",")
        if domain.strip()
    }


def verify_google_credential(credential: str) -> dict[str, Any]:
    google_client_id = get_google_client_id()
    if not google_client_id:
        raise GoogleAuthError("Google sign-in is not configured on the backend.")

    if id_token is None or Request is None:
        raise GoogleAuthError("Google auth dependency is missing on the backend.")

    try:
        payload = id_token.verify_oauth2_token(credential, Request(), google_client_id)
    except Exception as exc:  # pragma: no cover - external verification failure
        raise GoogleAuthError("Google sign-in could not be verified.") from exc

    google_sub = payload.get("sub")
    email = payload.get("email")
    hosted_domain = payload.get("hd")
    email_verified = payload.get("email_verified")

    if not isinstance(google_sub, str) or not google_sub:
        raise GoogleAuthError("Google account information is incomplete.")

    if not isinstance(email, str) or not email:
        raise GoogleAuthError("Google account email is missing.")

    if email_verified is not True:
        raise GoogleAuthError("Google account email is not verified.")

    allowed_domains = get_allowed_google_domains()
    if not isinstance(hosted_domain, str) or hosted_domain.lower() not in allowed_domains:
        raise GoogleAuthError("Only approved company Google accounts are allowed.")

    return {
        "google_sub": google_sub,
        "email": email.strip().lower(),
        "hosted_domain": hosted_domain.strip().lower(),
        "name": str(payload.get("name") or "").strip(),
    }
