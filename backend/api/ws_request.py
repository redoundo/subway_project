import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Literal
import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, WebSocket
from fastapi import WebSocketDisconnect, status
from backend.db import Logs, LogContent, User
from backend.db import logs_crud, user_crud
from backend.core import AuthenticationChecker

# In a real application, load this from a secure configuration
VIDEO_SERVER_URL = "http://localhost:9099/signal/{exam_id}"

ws_request_router = APIRouter()


class UserConnectionInfo:
    """Stores information about a connected user."""
    user_id: str
    role: Literal["examinee", "admin", "supervisor"]
    websocket: WebSocket

    def __init__(self, user_id: str, role: Literal["examinee", "admin", "supervisor"], websocket: WebSocket):
        self.user_id = user_id
        self.role =role
        self.websocket = websocket
        return

    class Config:
        arbitrary_types_allowed = True


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.connections: Dict[str, List[UserConnectionInfo]] = {}
        return

    async def connect(self, websocket: WebSocket, exam_id: str, user_id: str, role: Literal["examinee", "admin", "supervisor"]):
        """Accept and store a new WebSocket connection."""
        await websocket.accept()
        connection_info = UserConnectionInfo(user_id=user_id, role=role, websocket=websocket)
        if exam_id not in self.connections:
            self.connections[exam_id] = []
        self.connections[exam_id].append(connection_info)
        await self._log_event(user_id, "WEBSOCKET_CONNECTED", f"/ws/signal/{exam_id}")
        return

    async def disconnect(self, websocket: WebSocket, exam_id: str):
        """Remove a WebSocket connection."""
        if exam_id in self.connections:
            connection_to_remove = None
            for conn in self.connections[exam_id]:
                if conn.websocket == websocket:
                    connection_to_remove = conn
                    break
            if connection_to_remove:
                self.connections[exam_id].remove(connection_to_remove)
                await self._log_event(connection_to_remove.user_id, "WEBSOCKET_DISCONNECT", f"/ws/signal/{exam_id}")
        return

    def get_connection_info(self, websocket: WebSocket, exam_id: str) -> Optional[UserConnectionInfo]:
        """Retrieve connection info for a given websocket."""
        if exam_id in self.connections:
            for conn in self.connections[exam_id]:
                if conn.websocket == websocket:
                    return conn
        return None

    async def send_personal_message(self, message: dict, user_id: str, exam_id: str):
        """Send a message to a specific user in an exam."""
        target_conn = self._find_user_connection(user_id, exam_id)
        if target_conn:
            await target_conn.websocket.send_json(message)
            log_content = LogContent(content=message.get("content", ""), user_ids=[user_id])
            await self._log_event(user_id, "MESSAGE_TO_EXAMINEE", f"/ws/signal/{exam_id}", content=log_content)
        else:
            # This could be an error log or a specific action
            print(f"Error: User {user_id} not found in exam {exam_id}")
        return

    async def broadcast(self, message: dict, exam_id: str, sender_id: str):
        """Broadcast a message to all users in an exam."""
        if exam_id in self.connections:
            all_user_ids = [conn.user_id for conn in self.connections[exam_id]]
            log_content = LogContent(content=message.get("content", ""), user_ids=all_user_ids)
            await self._log_event(sender_id, "MESSAGE_TO_ALL_EXAMINEE", f"/ws/signal/{exam_id}", content=log_content)

            # Use asyncio.gather for concurrent sending
            await asyncio.gather(*[
                conn.websocket.send_json(message) for conn in self.connections[exam_id]
            ])
        return

    async def handle_webrtc_offer(self, websocket: WebSocket, exam_id: str, data: dict):
        """Handle WebRTC offer and forward to video server."""
        conn_info = self.get_connection_info(websocket, exam_id)
        if not conn_info:
            await websocket.send_json({"type": "error", "message": "Authentication failed."})
            return

        offer_payload = {
            "type": "offer",
            "payload": data.get("data"),
            "user_id": conn_info.user_id,
            "role": conn_info.role
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(VIDEO_SERVER_URL.format(exam_id=exam_id), json=offer_payload, timeout=10.0)
                response.raise_for_status()
                # Forward the SDP Answer from the video server back to the client
                await websocket.send_json(response.json())
            except httpx.RequestError as e:
                await websocket.send_json({"type": "error", "message": f"Failed to connect to video server: {e}"})
            except httpx.HTTPStatusError as e:
                await websocket.send_json({"type": "error", "message": f"Video server error: {e.response.text}"})
        return


    def _find_user_connection(self, user_id: str, exam_id: str) -> Optional[UserConnectionInfo]:
        """Find a user's connection info."""
        if exam_id in self.connections:
            for conn in self.connections[exam_id]:
                if conn.user_id == user_id:
                    return conn
        return None

    async def _log_event(self, user_id: str, log_type: str, url_path: str, content: Optional[LogContent] = None):
        """Helper to create and save a log entry."""
        user = await user_crud.get(ObjectId(user_id))
        if user:
            log_entry = Logs(
                user=user,
                log_type=log_type,
                url_path=url_path,
                content=content
            )
            await logs_crud.create(log_entry)
        return


manager = ConnectionManager()


@ws_request_router.websocket("/ws/signal/{exam_id}")
async def websocket_endpoint(
        websocket: WebSocket,
        exam_id: str,
        user_info: User = Depends(AuthenticationChecker(role=["admin", "examinee", "supervisor"]))
):
    """Main WebSocket endpoint for signaling and messaging."""

    await manager.connect(websocket, exam_id, str(user_info.id), user_info.role)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            conn_info = manager.get_connection_info(websocket, exam_id)

            if not conn_info:
                # This should not happen if connect was successful
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                break

            if msg_type == "webrtc-offer":
                await manager.handle_webrtc_offer(websocket, exam_id, data)

            elif msg_type == "message":
                target_user = data.get("user_id")
                if target_user:
                    await manager.send_personal_message(data, target_user, exam_id)
                else:
                    await manager.broadcast(data, exam_id, conn_info.user_id)
            else:
                # Handle unknown message types if necessary
                await manager.send_personal_message({"type": "error", "message": "Unknown message type"}, conn_info.user_id, exam_id)

    except WebSocketDisconnect:
        await manager.disconnect(websocket, exam_id)
    except Exception as e:
        # Log the specific error
        conn_info = manager.get_connection_info(websocket, exam_id)
        if conn_info:
            await manager._log_event(conn_info.user_id, "WEBSOCKET_ON_ERROR", f"/ws/signal/{exam_id}", content=LogContent(content=str(e), user_ids=[]))
            await manager.disconnect(websocket, exam_id)
        print(f"WebSocket Error for {exam_id}: {e}")
    return