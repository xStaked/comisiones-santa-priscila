import warnings

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://dinacuamar:dinacuamar@localhost:5432/dinacuamar"
    JWT_SECRET_KEY: str = "dev-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: str = "http://localhost:3000"
    ENV: str = "development"
    RATE_LIMIT_PER_MINUTE: int = 60

    @field_validator("ENV")
    @classmethod
    def validate_env(cls, v: str) -> str:
        if v not in ("development", "production"):
            raise ValueError('ENV debe ser "development" o "production"')
        return v

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, v: str, info) -> str:
        if info.data.get("ENV") == "production" and len(v) < 32:
            warnings.warn(
                "JWT_SECRET_KEY debe tener al menos 32 caracteres en producción",
                RuntimeWarning,
                stacklevel=2,
            )
        return v

    class Config:
        env_file = ".env"


settings = Settings()
