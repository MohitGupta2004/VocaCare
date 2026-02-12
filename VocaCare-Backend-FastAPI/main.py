from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import uvicorn
from typing import Optional
from dotenv import load_dotenv
from database import patient_registrations
import os

load_dotenv()
app = FastAPI(title="VocaCare Backend API", version="1.0.0")

# CORS Configuration - Allow frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://major-nine-gamma.vercel.app/"
    ],
    allow_credentials=False,  # Set to False to allow more flexibility
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store the latest webhook data in memory
latest_webhook_data = None


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "VocaCare Backend API",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/webhook/elevenlabs")
async def receive_webhook(request: Request):
    """
    Receives webhook data from ElevenLabs
    Configure this URL in your ElevenLabs agent settings
    """
    global latest_webhook_data
    
    try:
        # Get the webhook payload
        payload = await request.json()
        
        # Add timestamp to the data
        latest_webhook_data = {
            "body": payload,
            "timestamp": int(datetime.now().timestamp() * 1000)  # milliseconds
        }
        
        print(f"✅ Received webhook data at {datetime.now()}")
        print(f"Conversation ID: {payload.get('data', {}).get('conversation_id', 'N/A')}")
        
        # Extract and save patient data to MongoDB
        if payload.get('data', {}).get('analysis', {}).get('data_collection_results'):
            try:
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
                    "transcriptSummary": payload['data'].get('analysis', {}).get('transcript_summary', ''),
                    "callDuration": payload['data'].get('metadata', {}).get('call_duration_secs'),
                    "createdAt": datetime.now(),
                    "status": "completed"
                }
                
                # Save to MongoDB
                result = await patient_registrations.insert_one(patient_record)
                print(f"💾 Saved to MongoDB with ID: {result.inserted_id}")
                
            except Exception as db_error:
                print(f"⚠️ MongoDB save failed: {db_error}")
                print("📝 Continuing without database save...")
        
        return {"status": "success", "message": "Webhook received"}
    
    except Exception as e:
        print(f"❌ Error processing webhook: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.post("/webhook/livekit")
async def receive_livekit_webhook(request: Request):
    """
    Receives webhook data from LiveKit AI Agent
    Similar to ElevenLabs webhook but for LiveKit
    """
    global latest_webhook_data
    
    try:
        # Get the webhook payload
        payload = await request.json()
        
        # Add timestamp to the data
        latest_webhook_data = {
            "body": payload,
            "timestamp": int(datetime.now().timestamp() * 1000),
            "source": "livekit"
        }
        
        print(f"✅ Received LiveKit webhook data at {datetime.now()}")
        print(f"Conversation ID: {payload.get('data', {}).get('conversation_id', 'N/A')}")
        
        return {"status": "success", "message": "LiveKit webhook received"}
    
    except Exception as e:
        print(f"❌ Error processing LiveKit webhook: {str(e)}")
        return {"status": "error", "message": str(e)}


@app.get("/api/get-latest-webhook")
async def get_latest_webhook():
    """
    Endpoint that frontend polls to get the latest webhook data
    """
    if latest_webhook_data is None:
        return {
            "status": "no_data",
            "message": "No webhook data received yet"
        }
    
    return latest_webhook_data


@app.delete("/api/clear-webhook")
async def clear_webhook():
    """Clear the stored webhook data"""
    global latest_webhook_data
    latest_webhook_data = None
    return {"status": "success", "message": "Webhook data cleared"}


@app.get("/api/webhook-status")
async def webhook_status():
    """Check if webhook data is available"""
    return {
        "has_data": latest_webhook_data is not None,
        "last_update": latest_webhook_data.get("timestamp") if latest_webhook_data else None
    }


@app.get("/api/patients")
async def get_all_patients(limit: int = 50):
    """Get all patient records from MongoDB"""
    try:
        patients = []
        async for patient in patient_registrations.find().sort("createdAt", -1).limit(limit):
            patient['_id'] = str(patient['_id'])  # Convert ObjectId to string
            patients.append(patient)
        
        return {
            "status": "success",
            "count": len(patients),
            "patients": patients
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Database error: {str(e)}",
            "patients": []
        }


@app.get("/api/patients/{conversation_id}")
async def get_patient_by_id(conversation_id: str):
    """Get specific patient record by conversation ID"""
    try:
        patient = await patient_registrations.find_one({"conversationId": conversation_id})
        if patient:
            patient['_id'] = str(patient['_id'])
            return {
                "status": "success",
                "patient": patient
            }
        else:
            return {
                "status": "not_found",
                "message": "Patient not found"
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Database error: {str(e)}"
        }


@app.get("/api/stats")
async def get_stats():
    """Get database statistics"""
    try:
        total = await patient_registrations.count_documents({})
        
        return {
            "status": "success",
            "database": "connected",
            "total_patients": total,
            "collection": "patient_registrations"
        }
    except Exception as e:
        return {
            "status": "error",
            "database": "disconnected",
            "total_patients": 0,
            "message": str(e)
        }


@app.post("/api/livekit-token")
async def generate_livekit_token(request: Request):
    """Generate LiveKit access token for voice agent connection"""
    try:
        from livekit import api
        
        body = await request.json()
        room_name = body.get("room_name", f"vocare_room_{int(datetime.now().timestamp())}")
        participant_name = body.get("participant_name", "Patient")
        
        # Get LiveKit credentials from environment
        livekit_url = os.getenv("LIVEKIT_URL")
        livekit_api_key = os.getenv("LIVEKIT_API_KEY")
        livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
        
        if not all([livekit_url, livekit_api_key, livekit_api_secret]):
            return {
                "status": "error",
                "message": "LiveKit credentials not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in .env file"
            }
        
        # Create access token
        token = api.AccessToken(livekit_api_key, livekit_api_secret)
        token.with_identity(participant_name)
        token.with_name(participant_name)
        token.with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
        ))
        
        jwt_token = token.to_jwt()
        
        return {
            "status": "success",
            "token": jwt_token,
            "url": livekit_url,
            "room_name": room_name
        }
        
    except ImportError:
        return {
            "status": "error",
            "message": "LiveKit SDK not installed. Run: pip install livekit"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to generate LiveKit token: {str(e)}"
        }


if __name__ == "__main__":
    print("🚀 Starting VocaCare FastAPI Backend...")
    print("📡 Webhook endpoint: http://localhost:8000/webhook/elevenlabs")
    print("� LiveKit webhook: http://localhost:8000/webhook/livekit")
    print("�🔄 Polling endpoint: http://localhost:8000/api/get-latest-webhook")
    print("🎤 LiveKit token: http://localhost:8000/api/livekit-token")
    print("📊 API Docs: http://localhost:8000/docs")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True  # Auto-reload on code changes
    )

