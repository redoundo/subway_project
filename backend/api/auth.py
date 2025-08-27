from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Body, Response, Depends
from pydantic import BaseModel, Field
import secrets
from backend.core import create_jwt, AuthenticationChecker
from backend.db import User, LoginRequest, Logs, user_crud, login_request_crud
from cryptography.fernet import Fernet, InvalidToken

auth_router = APIRouter()

# --- Request/Response Models ---

class LoginRequestModel(BaseModel):
    email: str = Field(..., description="사용자 아이디", min_length=4)
    password: str = Field(..., description="비밀번호", min_length=5)
    invitationToken: Optional[str] = Field(description="초대 url의 맨 뒤에 위치한 토큰 값. 응시자, 감독관은 전부 이 값을 보내야 한다")

class LoginResponseModel(BaseModel):
    token: str = Field(description="발급된 JWT Access Token")
    role: str = Field(description="사용자 역할")
    expires_at: datetime = Field(description="토큰 만료 시간")


# --- API Endpoint ---

@auth_router.post("/login", response_model=LoginResponseModel)
async def login(response: Response, login_param: LoginRequestModel = Body(...)):
    """
    사용자 로그인을 처리하고 JWT를 발급합니다.
    """
    user: User | None = await user_crud.get_by({"email": login_param.email, "pwd": login_param.password})
    # 4. 데이터베이스 조회
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"code": "AUTH_INVALID", "message": "잘못된 아이디 또는 비밀번호입니다."}
        )

    # 관리자가 invitationToken 토큰을 들고 오는 경우, 올바른 로그인 요청이 아니므로 에러를 냅니다.
    if (user.role == "admin") and (login_param.invitationToken is not None):
        raise HTTPException(
            status_code=401,
            detail={"code": "AUTH_INVALID", "message": "관리자는 지정된 url 로만 로그인 할 수 있습니다."}
        )

    if user.role != "admin":
        # 응시자, 감독관은 invitationToken 을 보내야 합니다.
        if login_param.invitationToken is None:
            raise HTTPException(
                status_code=401,
                detail={"code": "AUTH_INVALID", "message": "로그인에 필요한 값들을 전부 제공해주세요."}
            )
        cipher_suite = Fernet(login_param.password)
        try:
            decrypted_user_id_bytes = cipher_suite.decrypt(login_param.invitationToken)
            decrypted_user_id: str = decrypted_user_id_bytes.decode('utf-8')
            if decrypted_user_id != str(user.id):
                raise HTTPException(
                    status_code=401,
                    detail={"code": "AUTH_INVALID", "message": "이메일로 받은 초대 url 로 입장 하세요. 만약 그렇게 했는데도 이 에러가 발생 한다면, 이메일과 비밀번호를 제대로 입력했는지 확인하세요."}
                )
        except InvalidToken:
            raise HTTPException(
                status_code=401,
                detail={"code": "AUTH_INVALID", "message": "제공하신 값 중에 유효하지 않은 값이 있습니다. 확인 후 다시 보내주세요."}
            )
    # 3. 로그인 시도 횟수 제한
    login_attempt: LoginRequest | None = await login_request_crud.get_by({"user.id" : user.id, "user.pwd" : user.pwd})
    now = datetime.now()

    if login_attempt and login_attempt.last_request_time > now - timedelta(minutes=10):
        if login_attempt.request_count >= 5:
            raise HTTPException(
                status_code=429,
                detail="로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."
            )
        login_attempt.request_count += 1
        login_attempt.last_request_time = now
        await login_attempt.save()
    else:
        # 10분이 지났거나 첫 시도인 경우
        login_attempt : LoginRequest = LoginRequest(
            user=user,
            last_request_time=now,
            request_count=1
        )
        await login_attempt.save()

    # 6. JWT 생성
    await login_attempt.delete() # 성공 시 시도 횟수 리셋
    token, expires_at = create_jwt(str(user.id), user.role, timedelta(hours=1))

    # 7. 성공 로그 기록
    log_entry = Logs(
        user=user,
        url_path="/auth/login",
        log_type="LOGIN_SUCCESS"
    )
    await log_entry.save()

    response.set_cookie(key="jwt_token", value=token, expires=expires_at)
    return LoginResponseModel(
        token=token,
        role=user.role,
        expires_at=expires_at
    )


class TestModel(BaseModel):

    name: str
    role: str
    email: str


@auth_router.post("/create_user_test")
async def create_user_test(response: Response, item: TestModel = Body(...)):
    print(item.model_dump())
    pwd : str = "pwd_" + secrets.token_urlsafe(25)
    user: User = User(name=item.name, role=item.role, pwd=pwd, email=item.email)
    user: User = await user_crud.create(user)
    jwt_token = create_jwt(str(user.id), item.role, timedelta(minutes=10))
    response.set_cookie(key="jwt_token", value=jwt_token[0], expires=jwt_token[1])
    return


@auth_router.post("/get_exist_user_test")
async def get_exist_user_test(request: TestModel = Body(...)):
    print(request.model_dump())
    user: User | None = await user_crud.get_by(request.model_dump())
    if user:
        return {"result" : user.model_dump_json()}
    return {"result": "None"}


@auth_router.get("/aut_checker_test")
async def auth_checker_test(user: User = Depends(AuthenticationChecker(role=["admin", "supervisor", "examinee"]))):
    print(user.model_dump())
    if user:
        return {"result" : user.model_dump_json()}
    return {"result": "None"}