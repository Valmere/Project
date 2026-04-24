from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    DIRECT_URL: str = ""
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    SUPABASE_LOGO_BUCKET: str = "logos"
    SUPABASE_REPORTS_BUCKET: str = "reports"

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    WEBAUTHN_RP_ID: str = "localhost"
    WEBAUTHN_RP_NAME: str = "Valmere & Co"
    WEBAUTHN_ORIGIN: str = "http://localhost:5173"


settings = Settings()
