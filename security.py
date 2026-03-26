import base64
import hashlib
import hmac
import os

try:
    from passlib.context import CryptContext
except ImportError:
    CryptContext = None


PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600000
PBKDF2_SALT_BYTES = 16
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") if CryptContext else None


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


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


def hash_password(password: str) -> str:
    if pwd_context is not None:
        return pwd_context.hash(password)
    return _hash_with_pbkdf2(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith(f"{PBKDF2_ALGORITHM}$"):
        return _verify_with_pbkdf2(plain_password, hashed_password)
    if pwd_context is None:
        return False
    return pwd_context.verify(plain_password, hashed_password)
