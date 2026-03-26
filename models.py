from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    email: str | None = Field(default=None, max_length=255)
    employee_id: str | None = Field(default=None, max_length=50)

    @field_validator("username")
    @classmethod
    def validate_non_blank_username(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip().lower()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("employee_id")
    @classmethod
    def validate_employee_id(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class User(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    message: str
    user: User


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=1)

    @field_validator("credential")
    @classmethod
    def validate_credential(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class GoogleAuthResponse(BaseModel):
    message: str
    user: User
    requires_employee_id: bool
    access_token: str | None = None
    setup_token: str | None = None
    token_type: str | None = None


class CompleteProfileRequest(BaseModel):
    employee_id: str = Field(min_length=1, max_length=50)
    setup_token: str = Field(min_length=1)

    @field_validator("employee_id", "setup_token")
    @classmethod
    def validate_non_blank_fields(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value
