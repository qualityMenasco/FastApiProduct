from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
# DATABASE_URL = "postgresql://postgres:root@localhost:5432/FastCrud"
DATABASE_URL = "postgresql://neondb_owner:npg_atYmNd1HMXP4@ep-square-salad-an96z726-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
