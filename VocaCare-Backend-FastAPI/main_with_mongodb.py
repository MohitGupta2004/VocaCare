"""
FastAPI Backend with MongoDB Integration
Use this version if you want to save patient data to MongoDB
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
import os
from dotenv import load_dotenv
from database import patient_registrations

# Load environment variables
load_dotenv()

app = FastAPI(title="VocaCare Backend API with MongoDB", version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "https://major-4w34.onrender.com",
        "https://major-nine-gamma.vercel.app/"
    ],
    allow_credentials=False,  # Set to False to allow more flexibility
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB Configuration
MONGODB_URI = os.getenv("MONGO_DB_URI", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "medical_records")
MONGODB_COLLECTION = os.getenv("MONGODB_COLLECTION", "patient_registrations")

# MongoDB Client
mongodb_client: Optional[AsyncIOMotorClient] = None
latest_webhook_data = None


@app.on_event("startup")
async def startup_db_client():
    """Initialize MongoDB connection on startup"""
    global mongodb_client
    try:
        mongodb_client = AsyncIOMotorClient(MONGODB_URI)
        # Test connection
        await mongodb_client.admin.command('ping')
        print("✅ Connected to MongoDB successfully")
    except Exception as e:
        print(f"⚠️ MongoDB connection failed: {e}")
        print("📝 Running in memory-only mode")
        mongodb_client = None


@app.on_event("shutdown")
async def shutdown_db_client():
    """Close MongoDB connection on shutdown"""
    global mongodb_client
    if mongodb_client:
        mongodb_client.close()
        print("👋 MongoDB connection closed")


def get_database():
    """Get MongoDB database"""
    if mongodb_client is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return mongodb_client[MONGODB_DATABASE]


@app.get("/")
async def root():
    """Health check endpoint"""
    db_status = "connected" if mongodb_client else "disconnected"
    return {
        "status": "running",
        "service": "VocaCare Backend API",
        "database": db_status,
        "timestamp": datetime.now().isoformat()
    }


@app.post("/webhook/elevenlabs")
async def receive_webhook(request: Request):
    """Receives webhook data from ElevenLabs and saves to MongoDB"""
    global latest_webhook_data
    
    try:
        payload = await request.json()
        
        # Add timestamp
        latest_webhook_data = {
            "body": payload,
            "timestamp": int(datetime.now().timestamp() * 1000)
        }
        
        # Extract patient data
        if payload.get('data', {}).get('analysis', {}).get('data_collection_results'):
            results = payload['data']['analysis']['data_collection_results']
            
            patient_record = {
                "name": results.get('Name', {}).get('value', ''),
                "age": results.get('Age', {}).get('value', ''),
                "gender": results.get('Gender', {}).get('value', ''),
                "contact": results.get('Contact', {}).get('value', ''),
                "address": results.get('Address ', {}).get('value', ''),
                "reason": results.get('Reason', {}).get('value', ''),
                "preferredDoctor": results.get('Preferred Doctor', {}).get('value', ''),
                "medicalHistory": results.get('Previous Medical History', {}).get('value', ''),
                "emergencyContact": results.get('Emergency Contact', {}).get('value', ''),
                "appointmentPreference": results.get('Appointment Preference', {}).get('value', ''),
                "conversationId": payload['data'].get('conversation_id'),
                "transcript": payload['data'].get('transcript', []),
                "callDuration": payload['data'].get('metadata', {}).get('call_duration_secs'),
                "createdAt": datetime.now(),
                "status": "completed"
            }
            
            # Save to MongoDB if available
            if mongodb_client:
                try:
                    db = get_database()
                    collection = db[MONGODB_COLLECTION]
                    result = await collection.insert_one(patient_record)
                    print(f"✅ Saved to MongoDB with ID: {result.inserted_id}")
                except Exception as e:
                    print(f"⚠️ MongoDB save failed: {e}")
        
        print(f"✅ Webhook received at {datetime.now()}")
        return {"status": "success", "message": "Webhook received and processed"}
    
    except Exception as e:
        print(f"❌ Error processing webhook: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.get("/api/get-latest-webhook")
async def get_latest_webhook():
    """Frontend polls this endpoint for latest data"""
    if latest_webhook_data is None:
        return {
            "status": "no_data",
            "message": "No webhook data received yet"
        }
    return latest_webhook_data


@app.get("/api/patients")
async def get_all_patients(limit: int = 50):
    """Get all patient records from MongoDB"""
    if not mongodb_client:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        db = get_database()
        collection = db[MONGODB_COLLECTION]
        
        patients = []
        async for patient in collection.find().sort("createdAt", -1).limit(limit):
            patient['_id'] = str(patient['_id'])  # Convert ObjectId to string
            patients.append(patient)
        
        return {"patients": patients, "count": len(patients)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patients/{conversation_id}")
async def get_patient_by_id(conversation_id: str):
    """Get specific patient record by conversation ID"""
    if not mongodb_client:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        db = get_database()
        collection = db[MONGODB_COLLECTION]
        
        patient = await collection.find_one({"conversationId": conversation_id})
        if patient:
            patient['_id'] = str(patient['_id'])
            return patient
        else:
            raise HTTPException(status_code=404, detail="Patient not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/clear-webhook")
async def clear_webhook():
    """Clear the stored webhook data"""
    global latest_webhook_data
    latest_webhook_data = None
    return {"status": "success", "message": "Webhook data cleared"}


@app.get("/api/stats")
async def get_stats():
    """Get database statistics"""
    if not mongodb_client:
        return {"database": "disconnected", "total_patients": 0}
    
    try:
        db = get_database()
        collection = db[MONGODB_COLLECTION]
        total = await collection.count_documents({})
        
        return {
            "database": "connected",
            "total_patients": total,
            "collection": MONGODB_COLLECTION
        }
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    print("🚀 Starting VocaCare FastAPI Backend with MongoDB...")
    print("📡 Webhook endpoint: http://localhost:8000/webhook/elevenlabs")
    print("🔄 Polling endpoint: http://localhost:8000/api/get-latest-webhook")
    print("📊 API Docs: http://localhost:8000/docs")
    print(f"💾 Database: {MONGODB_DATABASE}")
    
    uvicorn.run(
        "main_with_mongodb:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
