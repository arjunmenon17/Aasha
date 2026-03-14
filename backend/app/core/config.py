from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load environment from project root first, then local cwd fallback.
PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv()


class Settings(BaseSettings):
    # Supabase
    DATABASE_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""

    # Moorcheh AI
    MOORCHEH_API_KEY: str = ""

    # Twilio
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # App
    APP_ENV: str = "development"
    BASE_URL: str = "http://localhost:8000"
    CHW_DEFAULT_ID: str = ""
    DEMO_MODE: bool = True

    # Moorcheh namespace
    MOORCHEH_NAMESPACE: str = "aasha-clinical-protocols"

    class Config:
        env_file = ".env"


settings = Settings()
