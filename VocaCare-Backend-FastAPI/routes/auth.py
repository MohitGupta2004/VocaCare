"""Auth routes — login (all roles), doctor self-signup, profile, change-password."""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from config.settings import USERS_COLLECTION
from database.connection import get_db
from middleware.auth import get_current_user
from models.user import Token, UserCreate, UserLogin, UserResponse
from services.auth_service import (
    create_access_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str


# ---------------------------------------------------------------------------
# Login — works for Admin, Doctor, and Patient
# ---------------------------------------------------------------------------
@router.post("/login")
async def login(body: UserLogin, db=Depends(get_db)):
    user = await db[USERS_COLLECTION].find_one({"email": body.email})

    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is disabled.")

    token = create_access_token({"sub": user["email"], "role": user["role"]})
    logger.info(f"🔑 Login: {user['email']} ({user['role']})")

    return {
        "access_token": token,
        "token_type":   "bearer",
        "first_login":  user.get("first_login", False),   # ← frontend uses this to redirect
        "user": {
            "email":     user["email"],
            "full_name": user.get("full_name", ""),
            "role":      user["role"],
            "specialty": user.get("specialty"),
        },
    }


# ---------------------------------------------------------------------------
# Doctor self-registration
# ---------------------------------------------------------------------------
@router.post("/signup/doctor", status_code=status.HTTP_201_CREATED)
async def doctor_signup(body: UserCreate, db=Depends(get_db)):
    """Doctors can create their own account. Admins are seeded at startup."""
    existing = await db[USERS_COLLECTION].find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    user_doc = {
        "email":           body.email,
        "hashed_password": hash_password(body.password),
        "full_name":       body.full_name,
        "role":            "doctor",
        "specialty":       body.specialty,
        "is_active":       True,
        "first_login":     False,
        "created_at":      datetime.utcnow(),
    }
    await db[USERS_COLLECTION].insert_one(user_doc)
    logger.info(f"👨‍⚕️ Doctor registered: {body.email}")
    return {"message": "Doctor account created. Please log in."}


# ---------------------------------------------------------------------------
# Change password (patient forced first-login reset, anyone can call it)
# ---------------------------------------------------------------------------
@router.post("/change-password")
async def change_password(
    body: ChangePasswordBody,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if not verify_password(body.old_password, current_user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")

    await db[USERS_COLLECTION].update_one(
        {"email": current_user["email"]},
        {"$set": {
            "hashed_password": hash_password(body.new_password),
            "first_login":     False,              # clear the flag
        }}
    )
    logger.info(f"🔐 Password changed: {current_user['email']}")
    return {"message": "Password updated successfully."}


# ---------------------------------------------------------------------------
# Current user profile
# ---------------------------------------------------------------------------
@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        email=current_user["email"],
        full_name=current_user.get("full_name", ""),
        role=current_user["role"],
        specialty=current_user.get("specialty"),
    )
