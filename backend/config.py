from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _split_csv_ints(value: str) -> list[int]:
    parsed: list[int] = []
    seen: set[int] = set()
    for item in _split_csv(value):
        reminder_day = int(item)
        if reminder_day < 1 or reminder_day in seen:
            continue
        parsed.append(reminder_day)
        seen.add(reminder_day)
    return parsed


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
    project_documents_bucket: str = "project-documents"
    project_documents_signed_url_ttl_seconds: int = 3600
    project_documents_max_bytes: int = 10 * 1024 * 1024
    resend_api_key: str | None = None
    email_from_address: str = "alert@kianfalcon.com"
    email_from_name: str = "Workflow Tracker"
    frontend_url: str = "http://localhost:3000"
    enable_scheduler: bool = False

    # Stored as raw strings rather than ``list[str]`` so comma-separated env
    # values parse identically across pydantic-settings versions: list-typed
    # fields are JSON-decoded from env first, which rejects plain comma lists
    # like ``a,b`` and crashes on startup. Exposed as lists via the properties.
    allowed_origins_raw: str = Field(default="http://localhost:3000", alias="ALLOWED_ORIGINS")
    default_alert_recipients_raw: str = Field(default="", alias="DEFAULT_ALERT_RECIPIENTS")
    stage_reminder_offsets_raw: str = Field(default="7,3,1", alias="STAGE_REMINDER_OFFSETS_DAYS")

    @property
    def allowed_origins(self) -> list[str]:
        return _split_csv(self.allowed_origins_raw)

    @property
    def default_alert_recipients(self) -> list[str]:
        return _split_csv(self.default_alert_recipients_raw)

    @property
    def stage_reminder_offsets(self) -> list[int]:
        return _split_csv_ints(self.stage_reminder_offsets_raw)

    @property
    def email_from(self) -> str:
        return f"{self.email_from_name} <{self.email_from_address}>"


@lru_cache
def get_settings() -> Settings:
    return Settings()
