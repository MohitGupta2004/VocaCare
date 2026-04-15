"""
VocaCare Backend v2.1 — entry point.
"""
import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import FRONTEND_ORIGINS, MONGO_URI, DB_NAME
from database.connection import lifespan
from routes import auth, patients, webhook, websocket, doctor, admin

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="VocaCare API",
    description="AI-Powered Patient Registration System",
    version="2.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(doctor.router)
app.include_router(admin.router)
app.include_router(webhook.router)
app.include_router(websocket.router)

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
async def root():
    from datetime import datetime
    return {
        "service":   "VocaCare API",
        "version":   "2.1.0",
        "status":    "running",
        "timestamp": datetime.now().isoformat(),
    }

# Deprecated polling fallback
@app.get("/api/get-latest-webhook", tags=["Deprecated"])
async def get_latest_webhook():
    from routes.webhook import get_latest_webhook_data
    data = get_latest_webhook_data()
    if data is None:
        return {"status": "no_data", "message": "No webhook data received yet"}
    return data


if __name__ == "__main__":
    print("\n🚀  VocaCare Backend v2.1")
    print(f"📡  Webhook   : http://localhost:8000/webhook/elevenlabs")
    print(f"🔌  WebSocket : ws://localhost:8000/ws/updates")
    print(f"🔐  Login     : http://localhost:8000/auth/login")
    print(f"👨‍⚕️  Dr APIs  : http://localhost:8000/doctor/patients")
    print(f"🛡️   Admin API : http://localhost:8000/admin/patients")
    print(f"📊  Swagger   : http://localhost:8000/docs")
    print(f"💾  MongoDB   : {MONGO_URI}  →  {DB_NAME}\n")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
