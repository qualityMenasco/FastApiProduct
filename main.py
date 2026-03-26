import re
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine, get_db
from database_models import ProductDB, UserDB
from google_auth import GoogleAuthError, verify_google_credential
from models import (
    CompleteProfileRequest,
    GoogleAuthRequest,
    GoogleAuthResponse,
    LoginResponse,
    Product,
    ProductCreate,
    ProductUpdate,
    User,
)
from security import create_access_token, create_setup_token, decode_access_token


seed_products = [
    {
        "name": "laptop",
        "description": "A high performance laptop",
        "price": 999.99,
        "quantity": 10,
    },
    {
        "name": "mobile",
        "description": "A smartphone with great features",
        "price": 499.99,
        "quantity": 20,
    },
    {
        "name": "tv",
        "description": "A large screen television",
        "price": 799.99,
        "quantity": 5,
    },
]
bearer_scheme = HTTPBearer(auto_error=False)


def ensure_user_auth_schema() -> None:
    statements = (
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR",
        "ALTER TABLE users ALTER COLUMN employee_id DROP NOT NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_unique ON users (email)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub_unique ON users (google_sub)",
    )
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def fill_db_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.query(ProductDB).count() == 0:
            db.add_all(ProductDB(**product) for product in seed_products)
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def serialize_product(product_db: ProductDB) -> dict:
    return {
        "id": product_db.id,
        "name": product_db.name,
        "description": product_db.description,
        "price": product_db.price,
        "quantity": product_db.quantity,
    }


def serialize_user(user_db: UserDB) -> dict:
    return {
        "id": user_db.id,
        "username": user_db.username,
        "email": user_db.email,
        "employee_id": user_db.employee_id,
    }


def dump_schema(schema: ProductCreate | ProductUpdate) -> dict:
    if hasattr(schema, "model_dump"):
        return schema.model_dump()
    return schema.dict()


def build_username_base(name: str, email: str) -> str:
    raw_value = name or email.split("@", 1)[0]
    normalized = re.sub(r"[^a-zA-Z0-9]+", ".", raw_value.strip().lower()).strip(".")
    return normalized[:50] or "employee"


def build_unique_username(db: Session, name: str, email: str, current_user_id: int | None = None) -> str:
    username_base = build_username_base(name, email)
    candidate = username_base
    suffix = 1

    while True:
        query = db.query(UserDB).filter(UserDB.username == candidate)
        if current_user_id is not None:
            query = query.filter(UserDB.id != current_user_id)
        if query.first() is None:
            return candidate

        suffix_label = f".{suffix}"
        candidate = f"{username_base[: max(1, 50 - len(suffix_label))]}{suffix_label}"
        suffix += 1


def auth_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def build_login_response(user_db: UserDB) -> dict:
    if not user_db.google_sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account is not linked to this user",
        )

    access_token = create_access_token(
        {
            "sub": user_db.google_sub,
            "user_id": user_db.id,
            "username": user_db.username,
            "email": user_db.email,
            "employee_id": user_db.employee_id,
        }
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "message": "Login successful",
        "user": serialize_user(user_db),
    }


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserDB:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise auth_error()

    payload = decode_access_token(credentials.credentials)
    if payload is None or payload.get("token_kind") != "access":
        raise auth_error()

    google_sub = payload.get("sub")
    if not isinstance(google_sub, str) or not google_sub:
        raise auth_error()

    db_user = db.query(UserDB).filter(UserDB.google_sub == google_sub).first()
    if db_user is None or db_user.employee_id is None:
        raise auth_error()

    return db_user


def build_profile_setup_response(user_db: UserDB) -> dict:
    if not user_db.google_sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account is not linked to this user",
        )

    setup_token = create_setup_token(
        {
            "sub": user_db.google_sub,
            "user_id": user_db.id,
            "email": user_db.email,
        }
    )
    return {
        "message": "Company account verified. Enter your employee ID to finish setup.",
        "user": serialize_user(user_db),
        "requires_employee_id": True,
        "setup_token": setup_token,
        "token_type": "setup",
        "access_token": None,
    }


def resolve_google_auth_error(error: GoogleAuthError) -> HTTPException:
    error_message = str(error)
    if "configured" in error_message or "dependency" in error_message:
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    else:
        status_code = status.HTTP_401_UNAUTHORIZED
    return HTTPException(status_code=status_code, detail=error_message)


def get_or_create_google_user(identity: dict, db: Session) -> UserDB:
    google_sub = identity["google_sub"]
    email = identity["email"]
    name = identity["name"]

    db_user = db.query(UserDB).filter(UserDB.google_sub == google_sub).first()
    if db_user is None:
        db_user = db.query(UserDB).filter(UserDB.email == email).first()

    if db_user is None:
        db_user = UserDB(
            username=build_unique_username(db, name, email),
            email=email,
            google_sub=google_sub,
            employee_id=None,
            password_hash="",
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    has_updates = False
    if db_user.google_sub and db_user.google_sub != google_sub:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already linked to another Google account.",
        )

    if db_user.email != email:
        db_user.email = email
        has_updates = True

    if db_user.google_sub != google_sub:
        db_user.google_sub = google_sub
        has_updates = True

    if not db_user.username:
        db_user.username = build_unique_username(db, name, email, current_user_id=db_user.id)
        has_updates = True

    if has_updates:
        db.commit()
        db.refresh(db_user)

    return db_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_user_auth_schema()
    fill_db_if_empty()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "https://fast-api-product.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", dependencies=[Depends(get_current_user)])
def read_root():
    return "Hello saad World"


@app.post("/auth/google", response_model=GoogleAuthResponse)
def authenticate_with_google(auth_request: GoogleAuthRequest, db: Session = Depends(get_db)):
    try:
        identity = verify_google_credential(auth_request.credential)
    except GoogleAuthError as error:
        raise resolve_google_auth_error(error) from None

    db_user = get_or_create_google_user(identity, db)
    if db_user.employee_id is None:
        return build_profile_setup_response(db_user)

    login_response = build_login_response(db_user)
    return {
        **login_response,
        "requires_employee_id": False,
        "setup_token": None,
    }


@app.post("/auth/complete-profile", response_model=LoginResponse)
def complete_google_profile(profile_request: CompleteProfileRequest, db: Session = Depends(get_db)):
    payload = decode_access_token(profile_request.setup_token)
    if payload is None or payload.get("token_kind") != "profile_setup":
        raise auth_error()

    google_sub = payload.get("sub")
    if not isinstance(google_sub, str) or not google_sub:
        raise auth_error()

    db_user = db.query(UserDB).filter(UserDB.google_sub == google_sub).first()
    if db_user is None:
        raise auth_error()

    if db_user.employee_id == profile_request.employee_id:
        return build_login_response(db_user)

    existing_user = (
        db.query(UserDB)
        .filter(
            UserDB.employee_id == profile_request.employee_id,
            UserDB.id != db_user.id,
        )
        .first()
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee ID already exists",
        )

    db_user.employee_id = profile_request.employee_id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee ID already exists",
        ) from None
    db.refresh(db_user)
    return build_login_response(db_user)


@app.get("/products", response_model=list[Product], dependencies=[Depends(get_current_user)])
def get_all_products(db: Session = Depends(get_db)):
    products = db.query(ProductDB).all()
    return [serialize_product(product) for product in products]


@app.get("/products/{product_id}", response_model=Product, dependencies=[Depends(get_current_user)])
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(ProductDB, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return serialize_product(product)


@app.post(
    "/products",
    response_model=Product,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_user)],
)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    db_product = ProductDB(**dump_schema(product))
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return serialize_product(db_product)


@app.put("/products/{product_id}", response_model=Product, dependencies=[Depends(get_current_user)])
def update_product(product_id: int, updated_product: ProductUpdate, db: Session = Depends(get_db)):
    db_product = db.get(ProductDB, product_id)
    if db_product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    for field, value in dump_schema(updated_product).items():
        setattr(db_product, field, value)

    db.commit()
    db.refresh(db_product)
    return serialize_product(db_product)


@app.delete("/products/{product_id}", dependencies=[Depends(get_current_user)])
def delete_product(product_id: int, db: Session = Depends(get_db)):
    db_product = db.get(ProductDB, product_id)
    if db_product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    db.delete(db_product)
    db.commit()
    return {"message": "Product deleted successfully", "product_id": product_id}
