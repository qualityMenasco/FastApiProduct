from pydantic import BaseModel, ConfigDict, Field


class ProductBase(BaseModel):
    name: str
    description: str
    price: float
    quantity: int


class ProductCreate(ProductBase):
    pass


class ProductUpdate(ProductBase):
    pass


class Product(ProductBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    employee_id: str = Field(min_length=1, max_length=50)


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    employee_id: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class User(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    message: str
    user: User
