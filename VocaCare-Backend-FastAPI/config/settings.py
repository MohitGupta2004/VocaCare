"""Central settings — reads all environment variables in one place."""
from dotenv import load_dotenv
import os

load_dotenv()

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME: str = "medical_records"          # existing DB — keep data intact
PATIENTS_COLLECTION: str = "patient_registrations"
USERS_COLLECTION: str = "users"

# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-this-in-production-please")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "8"))

# ---------------------------------------------------------------------------
# Default Admin (seeded on first startup)
# ---------------------------------------------------------------------------
ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@vocare.com")
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "Admin@VocaCare123")
ADMIN_FULL_NAME: str = os.getenv("ADMIN_FULL_NAME", "System Administrator")

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
FRONTEND_ORIGINS: list[str] = [
    "http://localhost:5173",
    "http://localhost:3000",
]
