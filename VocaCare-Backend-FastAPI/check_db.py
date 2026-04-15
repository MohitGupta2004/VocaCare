import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['medical_records']
    
    patients = await db.patients.count_documents({})
    print(f'Total Patients: {patients}')
    
    doctors = await db.users.count_documents({'role': 'doctor'})
    print(f'Total Doctors: {doctors}')
    
    admin = await db.users.count_documents({'role': 'admin'})
    print(f'Total Admins: {admin}')
    
    cursor = db.patients.find()
    async for p in cursor:
        print(p)
    
if __name__ == '__main__':
    asyncio.run(main())
