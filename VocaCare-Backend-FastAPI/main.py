from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
import uvicorn
import os
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# MongoDB configuration
# ---------------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "medical_records"
COLLECTION_NAME = "patient_registrations"

mongodb_client: Optional[AsyncIOMotorClient] = None

# In-memory cache for the most recent webhook payload (for UI polling)
latest_webhook_data: Optional[dict] = None


# ---------------------------------------------------------------------------
# Lifespan — startup + shutdown in one place (modern FastAPI pattern)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    global mongodb_client
    try:
        mongodb_client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        await mongodb_client.admin.command("ping")
        print(f"✅ Connected to MongoDB at {MONGO_URI}")
        print(f"📁 Database: {DB_NAME}  |  Collection: {COLLECTION_NAME}")
    except Exception as e:
        print(f"⚠️  MongoDB connection failed: {e}")
        print("   Check that MongoDB is running and MONGO_URI is correct in .env")
        mongodb_client = None

    yield  # application runs here

    # ── Shutdown ─────────────────────────────────────────────────────────────
    if mongodb_client:
        mongodb_client.close()
        print("👋 MongoDB connection closed")


# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------
app = FastAPI(title="VocaCare Backend API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def get_collection():
    if mongodb_client is None:
        raise HTTPException(
            status_code=503,
            detail="Database not available — check that MongoDB is running.",
        )
    return mongodb_client[DB_NAME][COLLECTION_NAME]


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "status": "running",
        "service": "VocaCare Backend API",
        "database": "connected" if mongodb_client else "disconnected",
        "timestamp": datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# ElevenLabs webhook — called by ElevenLabs cloud after every conversation
# ---------------------------------------------------------------------------
@app.post("/webhook/elevenlabs")
async def receive_elevenlabs_webhook(request: Request):
    """
    Receives the post-call webhook from ElevenLabs.
    Saves structured patient data to MongoDB and caches the full payload
    in memory so the frontend can poll it.
    """
    global latest_webhook_data

    try:
        payload = await request.json()

        # Cache full payload for UI polling
        latest_webhook_data = {
            "body": payload,
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

        conv_id = payload.get("data", {}).get("conversation_id", "N/A")
        print(f"✅ Webhook received | conversation_id: {conv_id} | {datetime.now()}")

        # Extract structured patient data if available
        data_results = (
            payload.get("data", {})
            .get("analysis", {})
            .get("data_collection_results")
        )

        if data_results:
            patient_record = {
                "name":                  data_results.get("Name", {}).get("value", ""),
                "age":                   data_results.get("Age", {}).get("value", ""),
                "gender":                data_results.get("Gender", {}).get("value", ""),
                "contact":               data_results.get("Contact", {}).get("value", ""),
                # Handle both "Address" and "Address " (trailing-space variant from ElevenLabs)
                "address": (
                    data_results.get("Address", {}).get("value", "")
                    or data_results.get("Address ", {}).get("value", "")
                ),
                "reason":                data_results.get("Reason", {}).get("value", ""),
                "preferredDoctor":       data_results.get("Preferred Doctor", {}).get("value", ""),
                "medicalHistory":        data_results.get("Previous Medical History", {}).get("value", ""),
                "emergencyContact":      data_results.get("Emergency Contact", {}).get("value", ""),
                "appointmentPreference": data_results.get("Appointment Preference", {}).get("value", ""),
                "conversationId":        conv_id,
                "transcript":            payload.get("data", {}).get("transcript", []),
                "transcriptSummary":     (
                    payload.get("data", {})
                    .get("analysis", {})
                    .get("transcript_summary", "")
                ),
                "callDuration": (
                    payload.get("data", {})
                    .get("metadata", {})
                    .get("call_duration_secs")
                ),
                "createdAt": datetime.now(),
                "status":    "completed",
            }

            if mongodb_client:
                try:
                    collection = get_collection()
                    result = await collection.insert_one(patient_record)
                    print(f"💾 Patient record saved | _id: {result.inserted_id}")
                except Exception as db_err:
                    print(f"⚠️  MongoDB save failed: {db_err}")
            else:
                print("⚠️  MongoDB not connected — patient record NOT saved")
        else:
            print("ℹ️  Webhook received but payload has no data_collection_results")

        return {"status": "success", "message": "Webhook received"}

    except Exception as e:
        print(f"❌ Error processing webhook: {e}")
        return {"status": "error", "message": str(e)}


# ---------------------------------------------------------------------------
# Polling endpoint — frontend calls this every 2 s for live updates
# ---------------------------------------------------------------------------
@app.get("/api/get-latest-webhook")
async def get_latest_webhook():
    if latest_webhook_data is None:
        return {"status": "no_data", "message": "No webhook data received yet"}
    return latest_webhook_data


@app.delete("/api/clear-webhook")
async def clear_webhook():
    global latest_webhook_data
    latest_webhook_data = None
    return {"status": "success", "message": "Webhook data cleared"}


@app.get("/api/webhook-status")
async def webhook_status():
    return {
        "has_data": latest_webhook_data is not None,
        "last_update": latest_webhook_data.get("timestamp") if latest_webhook_data else None,
    }


# ---------------------------------------------------------------------------
# Patient records — read from MongoDB
# ---------------------------------------------------------------------------
@app.get("/api/patients")
async def get_all_patients(limit: int = 50):
    """Return all patient records, newest first."""
    collection = get_collection()
    patients = []
    async for patient in collection.find().sort("createdAt", -1).limit(limit):
        patient["_id"] = str(patient["_id"])
        patients.append(patient)
    return {"status": "success", "count": len(patients), "patients": patients}


@app.get("/api/patients/{conversation_id}")
async def get_patient_by_conversation_id(conversation_id: str):
    """Return a single patient record by ElevenLabs conversation ID."""
    collection = get_collection()
    patient = await collection.find_one({"conversationId": conversation_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    patient["_id"] = str(patient["_id"])
    return {"status": "success", "patient": patient}


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------
@app.get("/api/stats")
async def get_stats():
    if not mongodb_client:
        return {"database": "disconnected", "total_patients": 0}
    collection = get_collection()
    total = await collection.count_documents({})
    return {
        "database": "connected",
        "total_patients": total,
        "db_name": DB_NAME,
        "collection": COLLECTION_NAME,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("🚀 Starting VocaCare Backend...")
    print("📡 Webhook endpoint : http://localhost:8000/webhook/elevenlabs")
    print("🔄 Polling endpoint : http://localhost:8000/api/get-latest-webhook")
    print("📊 Swagger UI       : http://localhost:8000/docs")
    print(f"💾 MongoDB          : {MONGO_URI}  →  {DB_NAME}.{COLLECTION_NAME}")

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
