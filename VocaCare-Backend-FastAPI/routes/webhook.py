"""ElevenLabs webhook — full traced pipeline with WebSocket broadcast."""
import logging
from datetime import datetime

from fastapi import APIRouter, Request

from database.connection import get_db
from services.patient_service import save_patient_record, create_patient_account
from routes.websocket import manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Webhooks"])

# In-memory fallback for the polling endpoint (deprecated, kept for compat)
_latest_webhook_data: dict | None = None


def get_latest_webhook_data() -> dict | None:
    return _latest_webhook_data


# ---------------------------------------------------------------------------
# ElevenLabs post-call webhook
# ---------------------------------------------------------------------------
@router.post("/webhook/elevenlabs")
async def receive_elevenlabs_webhook(request: Request):
    """
    Complete traced pipeline:

    STEP 1 → Receive raw payload from ElevenLabs
    STEP 2 → Extract data_collection_results
    STEP 3 → Save patient record to MongoDB
    STEP 4 → Auto-create patient user account
    STEP 5 → Broadcast to all WebSocket clients
    """
    global _latest_webhook_data

    try:
        payload = await request.json()

        conv_id = payload.get("data", {}).get("conversation_id", "N/A")
        logger.info("=" * 60)
        logger.info("📡 STEP 1 | Webhook received from ElevenLabs")
        logger.info(f"           conversation_id: {conv_id}")

        # Cache for deprecated polling fallback
        _latest_webhook_data = {
            "body":      payload,
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

        # STEP 2 — Extract structured fields
        data_results = (
            payload.get("data", {})
            .get("analysis", {})
            .get("data_collection_results")
        )

        if not data_results:
            logger.info("ℹ️  STEP 2 | No data_collection_results — nothing to save")
            # Still broadcast so the UI can react to ANY webhook
            await manager.broadcast({"type": "webhook_received", "conversation_id": conv_id})
            return {"status": "success", "message": "Webhook received (no structured data)"}

        logger.info("✅ STEP 2 | data_collection_results extracted")

        patient_record = {
            "name":    data_results.get("Name", {}).get("value", ""),
            "age":     data_results.get("Age", {}).get("value", ""),
            "gender":  data_results.get("Gender", {}).get("value", ""),
            "contact": data_results.get("Contact", {}).get("value", ""),
            # Handle trailing-space variant ElevenLabs sometimes sends
            "address": (
                data_results.get("Address", {}).get("value", "")
                or data_results.get("Address ", {}).get("value", "")
            ),
            "reason":                data_results.get("Reason", {}).get("value", ""),
            "medicalHistory":        data_results.get("Previous Medical History", {}).get("value", ""),
            "emergencyContact":      data_results.get("Emergency Contact", {}).get("value", ""),
            "appointmentPreference": data_results.get("Appointment Preference", {}).get("value", ""),
            "conversationId":     conv_id,
            "transcript":         payload.get("data", {}).get("transcript", []),
            "transcriptSummary":  (
                payload.get("data", {}).get("analysis", {}).get("transcript_summary", "")
            ),
            "callDuration": (
                payload.get("data", {}).get("metadata", {}).get("call_duration_secs")
            ),
            "createdAt": datetime.now(),
            "status":    "registered",
        }

        logger.info(
            f"   Patient: {patient_record['name']} | "
            f"Contact: {patient_record['contact']} | "
            f"Reason: {patient_record['reason']}"
        )

        # STEP 3 — Save to MongoDB
        logger.info("⏳ STEP 3 | Saving to MongoDB...")
        db = get_db()
        patient_db_id = await save_patient_record(db, patient_record)
        logger.info(f"✅ STEP 3 | Saved | _id: {patient_db_id}")

        # STEP 4 — Auto-create patient account
        logger.info("⏳ STEP 4 | Creating patient user account...")
        credentials = await create_patient_account(db, patient_record, patient_db_id)
        logger.info(
            f"✅ STEP 4 | Account {'existed' if credentials['already_existed'] else 'created'} "
            f"| email: {credentials['email']}"
        )

        # STEP 5 — WebSocket broadcast
        logger.info("⏳ STEP 5 | Broadcasting to WebSocket clients...")
        ws_payload = {
            **patient_record,
            "createdAt": patient_record["createdAt"].isoformat(),
            "_id":        patient_db_id,
        }
        await manager.broadcast({
            "type":    "new_patient",
            "patient": ws_payload,
            "credentials": {
                "email": credentials["email"],
                "isNew": not credentials["already_existed"],
            },
        })
        logger.info(
            f"✅ STEP 5 | Broadcast sent to {manager.connection_count} client(s)"
        )
        logger.info("=" * 60)

        return {"status": "success", "message": "Patient registered and broadcast sent"}

    except Exception as exc:
        logger.error(f"❌ Webhook error: {exc}", exc_info=True)
        return {"status": "error", "message": str(exc)}
