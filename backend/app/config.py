from pydantic_settings import BaseSettings
import warnings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://dinacuamar:dinacuamar@localhost:5432/dinacuamar"
    JWT_SECRET_KEY: str = "dev-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: str = "http://localhost:3000"
    ENV: str = "development"
    RATE_LIMIT_PER_MINUTE: int = 60

    class Config:
        env_file = ".env"

    def model_post_init(self, __context):
        if self.ENV == "production" and len(self.JWT_SECRET_KEY) < 32:
            warnings.warn(
                "JWT_SECRET_KEY es demasiado corto para producción (mínimo 32 caracteres). "
                "Cambie la variable de entorno.",
                RuntimeWarning,
            )

settings = Settings()
