from contextlib import asynccontextmanager

from sqlalchemy import or_
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine, get_db
from database_models import ProductDB, UserDB
from models import LoginResponse, Product, ProductCreate, ProductUpdate, User, UserCreate, UserLogin
from security import hash_password, verify_password


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
        "employee_id": user_db.employee_id,
    }


def dump_schema(schema: ProductCreate | ProductUpdate) -> dict:
    if hasattr(schema, "model_dump"):
        return schema.model_dump()
    return schema.dict()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    fill_db_if_empty()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://fast-api-product.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return "Hello saad World"


@app.post("/auth/register", response_model=User, status_code=status.HTTP_201_CREATED)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = (
        db.query(UserDB)
        .filter(
            or_(
                UserDB.username == user.username,
                UserDB.employee_id == user.employee_id,
            )
        )
        .first()
    )
    if existing_user is not None:
        if existing_user.username == user.username:
            detail = "Username already exists"
        else:
            detail = "Employee ID already exists"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    db_user = UserDB(
        username=user.username,
        employee_id=user.employee_id,
        password_hash=hash_password(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return serialize_user(db_user)


@app.post("/auth/login", response_model=LoginResponse)
def login_user(user_credentials: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.employee_id == user_credentials.employee_id).first()
    if db_user is None or not verify_password(
        user_credentials.password,
        db_user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid employee ID or password",
        )

    return {
        "message": "Login successful",
        "user": serialize_user(db_user),
    }


@app.get("/products", response_model=list[Product])
def get_all_products(db: Session = Depends(get_db)):
    products = db.query(ProductDB).all()
    return [serialize_product(product) for product in products]


@app.get("/products/{product_id}", response_model=Product)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(ProductDB, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return serialize_product(product)


@app.post("/products", response_model=Product, status_code=status.HTTP_201_CREATED)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    db_product = ProductDB(**dump_schema(product))
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return serialize_product(db_product)


@app.put("/products/{product_id}", response_model=Product)
def update_product(product_id: int, updated_product: ProductUpdate, db: Session = Depends(get_db)):
    db_product = db.get(ProductDB, product_id)
    if db_product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    for field, value in dump_schema(updated_product).items():
        setattr(db_product, field, value)

    db.commit()
    db.refresh(db_product)
    return serialize_product(db_product)


@app.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    db_product = db.get(ProductDB, product_id)
    if db_product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    db.delete(db_product)
    db.commit()
    return {"message": "Product deleted successfully", "product_id": product_id}
