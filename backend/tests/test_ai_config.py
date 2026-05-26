import pytest

from app.config import Settings


AI_ENV_VARS = (
    "AI_EXTRACTION_PROVIDER",
    "AI_EXTRACTION_ENABLED",
    "OPENAI_API_KEY",
    "OPENAI_EXTRACTION_MODEL",
    "AI_EXTRACTION_TIMEOUT_SECONDS",
    "AI_EXTRACTION_MAX_FILE_MB",
)


def test_ai_extraction_defaults_are_safe(monkeypatch):
    for env_var in AI_ENV_VARS:
        monkeypatch.delenv(env_var, raising=False)

    settings = Settings(_env_file=None)

    assert settings.AI_EXTRACTION_PROVIDER == "openai"
    assert settings.AI_EXTRACTION_ENABLED is False
    assert settings.OPENAI_EXTRACTION_MODEL == "gpt-4.1-mini"
    assert settings.AI_EXTRACTION_TIMEOUT_SECONDS == 45
    assert settings.AI_EXTRACTION_MAX_FILE_MB == 10


def test_ai_extraction_openai_requires_api_key():
    with pytest.raises(ValueError, match="OPENAI_API_KEY es obligatorio"):
        Settings(
            AI_EXTRACTION_ENABLED=True,
            AI_EXTRACTION_PROVIDER="openai",
            OPENAI_API_KEY="",
            _env_file=None,
        )
