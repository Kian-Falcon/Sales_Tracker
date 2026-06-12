from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    database_url: str | None = None
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_key: str | None = None
    supabase_jwks_url: str | None = None
    resend_api_key: str | None = None
    frontend_url: str = "http://localhost:3000"
    enable_scheduler: bool = False

    # Stored as raw strings rather than ``list[str]`` so comma-separated env
    # values parse identically across pydantic-settings versions: list-typed
    # fields are JSON-decoded from env first, which rejects plain comma lists
    # like ``a,b`` and crashes on startup. Exposed as lists via the properties.
    allowed_origins_raw: str = Field(default="http://localhost:3000", alias="ALLOWED_ORIGINS")
    default_alert_recipients_raw: str = Field(default="", alias="DEFAULT_ALERT_RECIPIENTS")

    @property
    def allowed_origins(self) -> list[str]:
        return _split_csv(self.allowed_origins_raw)

    @property
    def default_alert_recipients(self) -> list[str]:
        return _split_csv(self.default_alert_recipients_raw)


@lru_cache
def get_settings() -> Settings:
    return Settings()
