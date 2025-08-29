from backend.api.auth import auth_router, LoginRequestModel, LoginResponseModel, create_jwt
from backend.api.ws_request import ws_request_router
from backend.api.sessions import sessions_router
from backend.api.exam import exam_router
from backend.api.reports import reports_router
from backend.api.websocket import sio
from backend.api.precheck import precheck_router
from backend.api.on_exam import on_exam_router