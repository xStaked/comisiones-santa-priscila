import importlib

import pytest


SETTINGS_ENV_VARS = (
    "DATABASE_URL",
    "JWT_SECRET_KEY",
    "JWT_ALGORITHM",
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "REFRESH_TOKEN_EXPIRE_DAYS",
    "CORS_ORIGINS",
    "ENV",
    "RATE_LIMIT_PER_MINUTE",
    "AI_EXTRACTION_PROVIDER",
    "AI_EXTRACTION_ENABLED",
    "OPENAI_API_KEY",
    "OPENAI_EXTRACTION_MODEL",
    "AI_EXTRACTION_TIMEOUT_SECONDS",
    "AI_EXTRACTION_MAX_FILE_MB",
)


def cargar_settings_aislado(monkeypatch):
    for env_var in SETTINGS_ENV_VARS:
        monkeypatch.delenv(env_var, raising=False)

    config = importlib.import_module("app.config")
    config = importlib.reload(config)
    return config.Settings


def test_ai_extraction_defaults_are_safe(monkeypatch):
    Settings = cargar_settings_aislado(monkeypatch)
    settings = Settings(_env_file=None)

    assert settings.AI_EXTRACTION_PROVIDER == "openai"
    assert settings.AI_EXTRACTION_ENABLED is False
    assert settings.OPENAI_EXTRACTION_MODEL == "gpt-4.1-mini"
    assert settings.AI_EXTRACTION_TIMEOUT_SECONDS == 45
    assert settings.AI_EXTRACTION_MAX_FILE_MB == 10


def test_ai_extraction_openai_requires_api_key(monkeypatch):
    Settings = cargar_settings_aislado(monkeypatch)

    with pytest.raises(ValueError, match="OPENAI_API_KEY es obligatorio"):
        Settings(
            AI_EXTRACTION_ENABLED=True,
            AI_EXTRACTION_PROVIDER="openai",
            OPENAI_API_KEY="",
            _env_file=None,
        )
