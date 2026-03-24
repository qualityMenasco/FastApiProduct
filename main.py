from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine, get_db
from database_models import ProductDB
from models import Product, ProductCreate, ProductUpdate

from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()
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


def serialize_product(product_db: ProductDB) -> Product:
    if hasattr(Product, "model_validate"):
        return Product.model_validate(product_db)
    return Product.from_orm(product_db)


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

@app.get("/")
def read_root():
    return "Hello saad World"

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
