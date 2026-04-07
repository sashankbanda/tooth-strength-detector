import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BASE_DIR / ".env"
FRONTEND_DIR = BASE_DIR / "frontend"
OUTPUT_DIR = FRONTEND_DIR / "output"
TEMP_UPLOAD_DIR = OUTPUT_DIR / "temp_uploads"
DATA_DIR = BASE_DIR / "data"
INDEX_FILE = FRONTEND_DIR / "index.html"

load_dotenv(ENV_FILE)


def _split_csv_env(name: str) -> list[str]:
    raw_value = os.getenv(name, "")
    return [value.strip() for value in raw_value.split(",") if value.strip()]


def _read_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    try:
        return int(raw_value)
    except ValueError:
        return default


def _resolve_database_url(raw_url: str) -> str:
    if not raw_url:
        return f"sqlite:///{(DATA_DIR / 'tooth_app.db').resolve().as_posix()}"

    if raw_url.startswith("sqlite:///./"):
        relative_path = raw_url.replace("sqlite:///./", "", 1)
        return f"sqlite:///{(BASE_DIR / relative_path).resolve().as_posix()}"

    return raw_url


ROBOFLOW_API_KEY = os.getenv("ROBOFLOW_API_KEY", "").strip()
DATABASE_URL = _resolve_database_url(os.getenv("DATABASE_URL", "").strip())
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256").strip() or "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = _read_int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 10080)

CORS_ALLOW_ORIGINS = _split_csv_env("CORS_ALLOW_ORIGINS") or [
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
CORS_ALLOW_ORIGIN_REGEX = os.getenv("CORS_ALLOW_ORIGIN_REGEX", r"https://.*\.onrender\.com")


def ensure_runtime_directories() -> None:
    for directory in (DATA_DIR, OUTPUT_DIR, TEMP_UPLOAD_DIR):
        os.makedirs(directory, exist_ok=True)
