import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone

try:
    import bcrypt
except ImportError:
    bcrypt = None


PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600000
PBKDF2_SALT_BYTES = 16
BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "change-this-jwt-secret-in-production",
)


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _b64encode_json(value: dict) -> str:
    return _b64encode(json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8"))


def _sign_jwt_value(value: str) -> bytes:
    return hmac.new(
        JWT_SECRET_KEY.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).digest()


def _hash_with_pbkdf2(password: str) -> str:
    salt = os.urandom(PBKDF2_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"{PBKDF2_ALGORITHM}${PBKDF2_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def _verify_with_pbkdf2(plain_password: str, hashed_password: str) -> bool:
    try:
        algorithm, iterations, salt, expected_digest = hashed_password.split("$", 3)
        if algorithm != PBKDF2_ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            _b64decode(salt),
            int(iterations),
        )
    except (TypeError, ValueError):
        return False

    return hmac.compare_digest(_b64encode(digest), expected_digest)


def _verify_with_bcrypt(plain_password: str, hashed_password: str) -> bool:
    if bcrypt is None:
        return False

    password_bytes = plain_password.encode("utf-8")
    hash_bytes = hashed_password.encode("utf-8")

    try:
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except ValueError:
        # Older bcrypt behavior silently truncated passwords after 72 bytes.
        return bcrypt.checkpw(password_bytes[:72], hash_bytes)


def hash_password(password: str) -> str:
    return _hash_with_pbkdf2(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith(f"{PBKDF2_ALGORITHM}$"):
        return _verify_with_pbkdf2(plain_password, hashed_password)
    if hashed_password.startswith(BCRYPT_PREFIXES):
        return _verify_with_bcrypt(plain_password, hashed_password)
    return False


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    expire_at = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        **data,
        "exp": int(expire_at.timestamp()),
    }
    header = {
        "alg": JWT_ALGORITHM,
        "typ": "JWT",
    }
    signing_input = f"{_b64encode_json(header)}.{_b64encode_json(payload)}"
    signature = _b64encode(_sign_jwt_value(signing_input))
    return f"{signing_input}.{signature}"


def decode_access_token(token: str) -> dict | None:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}"
        expected_signature = _sign_jwt_value(signing_input)
        provided_signature = _b64decode(signature_b64)

        if not hmac.compare_digest(expected_signature, provided_signature):
            return None

        header = json.loads(_b64decode(header_b64).decode("utf-8"))
        if header.get("alg") != JWT_ALGORITHM or header.get("typ") != "JWT":
            return None

        payload = json.loads(_b64decode(payload_b64).decode("utf-8"))
        expires_at = int(payload.get("exp"))
    except (TypeError, ValueError, json.JSONDecodeError):
        return None

    if expires_at < int(datetime.now(timezone.utc).timestamp()):
        return None

    return payload
