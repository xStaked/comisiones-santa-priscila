import warnings

from pydantic import field_validator, model_validator
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
    AI_EXTRACTION_PROVIDER: str = "openai"
    AI_EXTRACTION_ENABLED: bool = False
    OPENAI_API_KEY: str = ""
    OPENAI_EXTRACTION_MODEL: str = "gpt-4.1-mini"
    AI_EXTRACTION_TIMEOUT_SECONDS: int = 45
    AI_EXTRACTION_MAX_FILE_MB: int = 10

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

    @field_validator("AI_EXTRACTION_PROVIDER")
    @classmethod
    def validate_ai_provider(cls, v: str) -> str:
        if v not in ("openai", "disabled"):
            raise ValueError('AI_EXTRACTION_PROVIDER debe ser "openai" o "disabled"')
        return v

    @field_validator("AI_EXTRACTION_TIMEOUT_SECONDS", "AI_EXTRACTION_MAX_FILE_MB")
    @classmethod
    def validate_positive_ai_limits(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Los limites de extraccion IA deben ser mayores a cero")
        return v

    @model_validator(mode="after")
    def validate_ai_provider_settings(self) -> "Settings":
        if (
            self.AI_EXTRACTION_ENABLED
            and self.AI_EXTRACTION_PROVIDER == "openai"
            and not self.OPENAI_API_KEY.strip()
        ):
            raise ValueError(
                "OPENAI_API_KEY es obligatorio cuando AI_EXTRACTION_ENABLED=true "
                "y AI_EXTRACTION_PROVIDER=openai"
            )
        return self

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
