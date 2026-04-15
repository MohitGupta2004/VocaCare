"""WebSocket connection manager and endpoint."""
import logging
from typing import List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """
    Manages all active WebSocket connections.
    Thread-safe broadcasts are achieved by catching and removing dead connections.
    """

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"🔌 WS client connected  | total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"🔌 WS client disconnected | total: {len(self.active_connections)}")

    async def broadcast(self, message: dict) -> None:
        """Push a JSON message to every connected client; remove dead sockets."""
        dead: List[WebSocket] = []
        for ws in self.active_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.remove(ws)

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


# Singleton shared across the application
manager = ConnectionManager()


@router.websocket("/ws/updates")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time update channel.
    - Sends {"type": "connected"} on connect.
    - Receives "ping" → replies "pong" (keep-alive).
    - Broadcasts new patient data when ElevenLabs webhook fires.
    """
    await manager.connect(websocket)
    try:
        await websocket.send_json({
            "type": "connected",
            "message": "VocaCare real-time channel active",
        })
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
