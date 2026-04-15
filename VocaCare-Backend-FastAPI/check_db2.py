import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['medical_records']
    
    cursor = db.users.find()
    async for u in cursor:
        print(u)
    
if __name__ == '__main__':
    asyncio.run(main())
