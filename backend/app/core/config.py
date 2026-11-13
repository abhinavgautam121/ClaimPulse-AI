from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    database_url: str
    jwt_secret: str
    demo_mode: bool = False
    seed_count: int = 20000
    cors_origins: list[str] = ["http://localhost:3000"]
    cookie_secure: bool = False
    webhook_secret: str = ""
    fhir_base_url: str = ""
    fhir_token: str = ""
    poll_seconds: int = 300
    ai_provider: str = "deterministic"
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    source_root: str = str(ROOT)
    artifacts_dir: str = str(ROOT / "backend/artifacts")


settings = Settings()
if len(settings.jwt_secret) < 32:
    raise ValueError("JWT_SECRET must contain at least 32 characters")
