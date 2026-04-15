"""Patient routes — protected by JWT + RBAC."""
from fastapi import APIRouter, Depends, HTTPException, Query

from config.settings import PATIENTS_COLLECTION, USERS_COLLECTION
from database.connection import get_db
from middleware.auth import require_role, get_current_user
from services.patient_service import (
    get_all_patients,
    get_patient_by_conversation_id,
    get_patient_by_record_id,
)

router = APIRouter(prefix="/api", tags=["Patients"])


# ---------------------------------------------------------------------------
# Admin + Doctor — full patient list
# ---------------------------------------------------------------------------
@router.get("/patients")
async def list_patients(
    limit: int = Query(default=50, le=500),
    current_user=Depends(require_role("admin", "doctor")),
    db=Depends(get_db),
):
    patients = await get_all_patients(db, limit)
    return {"status": "success", "count": len(patients), "patients": patients}


@router.get("/patients/{conversation_id}")
async def get_patient(
    conversation_id: str,
    current_user=Depends(require_role("admin", "doctor")),
    db=Depends(get_db),
):
    patient = await get_patient_by_conversation_id(db, conversation_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return {"status": "success", "patient": patient}


# ---------------------------------------------------------------------------
# Patient — view their own record only
# ---------------------------------------------------------------------------
@router.get("/my-record")
async def get_my_record(
    current_user=Depends(require_role("patient")),
    db=Depends(get_db),
):
    """Patient portal: returns the registration record linked to this account."""
    record_id = current_user.get("patient_record_id")
    if not record_id:
        raise HTTPException(status_code=404, detail="No linked patient record found.")

    patient = await get_patient_by_record_id(db, record_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient record not found.")
    return {"status": "success", "patient": patient}


# ---------------------------------------------------------------------------
# Stats — admin + doctor
# ---------------------------------------------------------------------------
@router.get("/stats")
async def get_stats(
    current_user=Depends(require_role("admin", "doctor")),
    db=Depends(get_db),
):
    total_patients = await db[PATIENTS_COLLECTION].count_documents({})
    total_users    = await db[USERS_COLLECTION].count_documents({})
    doctors        = await db[USERS_COLLECTION].count_documents({"role": "doctor"})
    return {
        "database":       "connected",
        "total_patients": total_patients,
        "total_users":    total_users,
        "total_doctors":  doctors,
    }
