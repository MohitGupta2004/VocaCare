import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['medical_records']
    
    patients = await db.patient_registrations.count_documents({})
    print(f'Total Patients: {patients}')
    
    cursor = db.patient_registrations.find()
    async for p in cursor:
        print(p)
    
if __name__ == '__main__':
    asyncio.run(main())
