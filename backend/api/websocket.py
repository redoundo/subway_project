import os, socketio
from bson import ObjectId
import jwt
from dotenv import load_dotenv
from typing import Dict, Set, Optional
from backend.db import Logs, LogContent, User
from backend.db import logs_crud, user_crud, examinee_crud

load_dotenv()

JWT_SECRET: str = os.getenv("JWT_SECRET")
ALGORITHM: str = os.getenv("ALGORITHM")

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# 1. 감독관 SID를 관리하기 위한 전역 변수 추가
proctor_sids: Dict[str, Set[str]] = {}


async def get_user_from_token(token: str) -> Optional[User]:
    """Helper function to authenticate user from a JWT token."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        user = await user_crud.get(ObjectId(user_id))
        return user
    except jwt.PyJWTError:
        return None
    except Exception as e:
        print(f"An unexpected error occurred during token validation: {e}")
        return None


async def log_event(user_id: str, log_type: str, url_path: str, content: Optional[LogContent] = None):
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


@sio.on("connect")
async def connect(sid, environ , auth):
    """Handle new client connections with authentication."""
    token = auth["token"]
    exam_id = auth["exam_id"]

    if not token or not exam_id:
        print(f"Connection rejected for sid {sid}: Missing token or exam_id.")
        return False  # Reject connection

    user = await get_user_from_token(token)
    if not user or not user.id:
        print(f"Connection rejected for sid {sid}: Invalid token.")
        return False  # Reject connection

    await sio.save_session(sid, {"user_id": str(user.id), "role": user.role, "exam_id": exam_id})
    await sio.enter_room(sid, room=exam_id)

    # 2. 역할(role)에 따라 다른 로직 수행
    if user.role == "supervisor":
        # 감독관일 경우, proctor_sids 딕셔너리에 추가
        if exam_id not in proctor_sids:
            proctor_sids[exam_id] = set()
        proctor_sids[exam_id].add(sid)
        print(f"Proctor {user.id} connected to exam {exam_id}. Current proctors: {len(proctor_sids[exam_id])}")

    elif user.role == "examinee":
        # 응시자일 경우, 해당 시험의 모든 감독관에게 'examinee_connected' 이벤트 전송
        if exam_id in proctor_sids:
            proctors_in_room = proctor_sids[exam_id]
            for proctor_sid in proctors_in_room:
                await sio.emit("examinee_connected", {"userId": str(user.id)}, to=proctor_sid)
            print(f"Notified {len(proctors_in_room)} proctors about new examinee {user.id}")

    await log_event(str(user.id), "WEBSOCKET_CONNECTED", f"/ws/signal/{exam_id}")
    print(f"Client connected: {sid}, User: {user.id}, Role: {user.role}, Exam: {exam_id}")
    return True

@sio.on("disconnect")
async def disconnect(sid):
    """Handle client disconnections."""
    session = await sio.get_session(sid)
    if session:
        user_id = session.get("user_id")
        exam_id = session.get("exam_id")
        role = session.get("role")

        # 3. 감독관의 연결이 끊어졌을 경우, proctor_sids에서 제거
        if role == "supervisor" and exam_id in proctor_sids and sid in proctor_sids[exam_id]:
            proctor_sids[exam_id].remove(sid)
            if not proctor_sids[exam_id]:  # Set이 비어있으면 키 삭제
                del proctor_sids[exam_id]
            print(f"Proctor {user_id} disconnected from exam {exam_id}.")

        # (기존 로직 유지) 응시자 연결 종료 시 감독관에게 알림
        elif role == "examinee" and exam_id in proctor_sids:
            proctors_in_room = proctor_sids[exam_id]
            for proctor_sid in proctors_in_room:
                await sio.emit("examinee_disconnected", {"userId": user_id}, to=proctor_sid)
            print(f"Notified {len(proctors_in_room)} proctors about examinee {user_id} disconnection.")
            await examinee_crud.update(ObjectId(user_id), {"status" : "disconnected"})

        await log_event(user_id, "WEBSOCKET_DISCONNECT", f"/ws/signal/{exam_id}")
        print(f"Client disconnected: {sid}, User: {user_id}, Exam: {exam_id}")

@sio.on("message")
async def handle_message(sid, data: Dict):
    """Handle incoming messages, either personal or broadcast."""
    session = await sio.get_session(sid)
    if not session:
        await sio.emit("error", {"message": "Authentication failed."}, to=sid)
        return

    exam_id = session["exam_id"]
    sender_id = session["user_id"]
    target_user_id = data.get("user_id")

    if sid not in list(proctor_sids[exam_id]):
        await sio.emit("error", {"message" : "You're not Supervisor. Only Supervisor can send message."}, to=sid)
        return

    if target_user_id:
        # Personal message
        target_sid = None
        # Find the sid of the target user in the same exam room
        for other_sid in sio.rooms(exam_id):
            other_session = await sio.get_session(other_sid)
            if other_session and other_session.get("user_id") == target_user_id:
                target_sid = other_sid
                break

        if target_sid:
            await sio.emit("message", data, to=target_sid)
            log_content = LogContent(content=data.get("content", ""), user_ids=[target_user_id])
            await log_event(sender_id, "MESSAGE_TO_EXAMINEE", f"/ws/signal/{exam_id}", content=log_content)
        else:
            print(f"Error: User {target_user_id} not found in exam {exam_id}")
            await sio.emit("error", {"message": f"User {target_user_id} not found."}, to=sid)
    else:
        # Broadcast message to everyone in the exam room except the sender
        await sio.emit("message", data, room=exam_id, skip_sid=sid)
        
        # For logging, get all user IDs in the room
        all_user_ids = []
        for other_sid in sio.rooms(exam_id):
            other_session = await sio.get_session(other_sid)
            if other_session:
                all_user_ids.append(other_session.get("user_id"))
        
        log_content = LogContent(content=data.get("content", ""), user_ids=all_user_ids)
        await log_event(sender_id, "MESSAGE_TO_ALL_EXAMINEE", f"/ws/signal/{exam_id}", content=log_content)

# General error handler
@sio.on("*")
async def catch_all(event, sid, data):
    session = await sio.get_session(sid)
    if session:
        user_id = session.get("user_id")
        exam_id = session.get("exam_id")
        error_content = LogContent(content=f"Unhandled event '{event}' with data: {data}", user_ids=[])
        await log_event(user_id, "WEBSOCKET_ON_ERROR", f"/ws/signal/{exam_id}", content=error_content)
    print(f"Unhandled event for sid {sid}: {event} - {data}")
