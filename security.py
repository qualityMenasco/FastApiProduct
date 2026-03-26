import base64
import hashlib
import hmac
import os

try:
    import bcrypt
except ImportError:
    bcrypt = None


PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600000
PBKDF2_SALT_BYTES = 16
BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")


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
