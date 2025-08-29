from datetime import datetime, timedelta, UTC
import jwt, os, base64
from typing import List, Literal
from cryptography.fernet import Fernet
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Request, HTTPException
from backend.db import user_crud, exam_crud, exam_session_crud
from backend.db import User, Exam, ExamSession
from pydantic import BaseModel, Field
import csv
import uuid

from io import StringIO
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

load_dotenv()
JWT_SECRET: str = os.getenv("JWT_SECRET")
EMAIL_APP_PWD: str = os.getenv("EMAIL_APP_PWD")
SMTP_PORT: str = os.getenv("SMTP_PORT")
SMTP_SERVER: str = os.getenv("SMTP_SERVER")
EMAIL_ADDR: str = os.getenv("EMAIL_ADDR")
ALGORITHM: str = os.getenv("ALGORITHM")
SALT: str = os.getenv("SALT")

class Payload(BaseModel):
    sub: str = Field(description="user_id", min_length=2)
    role: str = Field(description="user_role", min_length=2)
    exp: datetime = Field(description="expire datetime")

def create_jwt(user_id: str, role: str, expires_delta: timedelta) -> tuple[str, datetime]:
    """JWT를 생성하고 만료 시간을 반환합니다."""
    expire = datetime.now(UTC) + expires_delta
    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)
    return token, expire

async def decode_jwt_token(jwt_token: str) -> Payload:
    try:
        payload = jwt.decode(jwt_token, JWT_SECRET, algorithms=ALGORITHM)
        if datetime.fromtimestamp(payload["exp"]) < datetime.now():
            raise HTTPException(status_code=401, detail="Token has expired")
        user_id: str = payload.get("sub")
        user_role: str = payload.get("role")
        return Payload(sub=user_id, role=user_role, exp=payload["exp"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


class AuthenticationChecker:
    """
    __call__ 메서드의 반환 값이 필요할 땐, user_info: User = Depends(AuthenticationChecker(role=["admin", "examinee"])) 같이 사용 됩니다..
    만약 필요하지 않다면 @router.post("/url", dependencies=[Depends(AuthenticationChecker(role=["admin"]))]) 와 같이 사용 됩니다.
    """

    allowed_roles: List[Literal["examinee", "admin", "supervisor"]]

    def __init__(self, role: List[Literal["examinee", "admin", "supervisor"]]):
        self.allowed_roles = role
        return

    async def __call__(self, request: Request):
        jwt_token = request.cookies.get("jwt_token")
        print(jwt_token)
        if not jwt_token:
            raise HTTPException(status_code=401, detail="Not authenticated, token not found")

        payload = await decode_jwt_token(jwt_token)
        if payload.role not in self.allowed_roles:
            raise HTTPException(status_code=403, detail="Permission denied")
        user: User | None = await user_crud.get(ObjectId(payload.sub))
        if not user:
            raise HTTPException(status_code=403, detail="not exist")
        return user


class ExamSessionAuthenticationChecker(AuthenticationChecker):
    """
    시험 세션에 진입 하거나 시험 세션을 생성할 때 AuthenticationChecker 대신 사용 가능한 클래스입니다.
    세션 요청을 받는 메서드들에 중복되는 작업이 많아 생성하게 되었습니다.

    - jwt 유효성 확인 및 User 정보 반환
    - exam_id, session_id 존재 확인
    - request 에 들어 있는 exam_id 값과 동일한 Exam 이 db 에 있는지 확인
    - 동일한 exam_id, session_id 를 가진 ExamSession 존재 여부 확인
    - role 에 맞는 확인 절차 진행.

    create_session, join_session 과 같은 요청은 session_id 가 필수가 아니므로, session_id_required 값을 받습니다.   
    하지만 join_session, supervisor_join_session 은 session_id 가 없어도 상관 없지만, ExamSession 은 존재해야 하므로 이를 구분하기 위한 exam_session_must_exist 를 받습니다.
    사용 방법은 AuthenticationChecker 와 동일하나, 반환 값은 tuple[User, ExamSession | None] 입니다.
    """

    session_id_required: bool
    exam_session_must_exist: bool

    def __init__(self,
                 role: List[Literal["examinee", "admin", "supervisor"]],
                 session_id_required: bool = True,
                 exam_session_must_exist: bool = True
                 ):
        super().__init__(role)
        self.session_id_required = session_id_required
        self.exam_session_must_exist = exam_session_must_exist
        return


    async def __call__(self, request: Request):
        exam_id: str | None = request.path_params.get('exam_id')
        if exam_id is None:
            raise HTTPException(status_code=401, detail="The exec_id must exist.")
        print(request.cookies)
        exam: Exam | None = await exam_crud.get(ObjectId(exam_id))
        print(exam)
        if not exam: # 이 클래스는 시험 세션에 입장했을 때나 시험 세션을 생성할 때만 사용 됩니다. 따라서 exam 은 반드시 db 에 존재해야 합니다.
            raise HTTPException(status_code=404, detail="Exam not found")

        session_id: str | None = request.cookies.get('session_id')
        print(session_id, self.session_id_required)
        if self.session_id_required and (session_id is None):
            raise HTTPException(status_code=401, detail="session_id is required, but does not exist.")

        user_info: User = await super().__call__(request)
        print(user_info)
        query: dict = {"exam._id" : ObjectId(exam_id)}
        if session_id is not None:
            query["session_id"] = session_id

        exam_session : ExamSession | None = await exam_session_crud.get_by(query)
        # 시험 세션은 오로지 관리자만 생성 가능합니다. 감독관과 응시자는 시험 세션을 생성할 권한이 없으므로 에러를 냅니다.
        if (exam_session is None) and self.exam_session_must_exist and (user_info.role != "admin"):
            raise HTTPException(status_code=401, detail="The exam session you are attempting to participate in does not exist, and you are not authorized to create it.")

        if user_info.role == "supervisor":
            supervisor_ids: list[str] = [str(ps.id) for ps in exam.proctors]
            # user_info 의 role 이 감독관이라면 시험 감독에 참여하는 감독관들의 id 에 str(user_info.id) 값이 존재하는지 확인합니다.
            if str(user_info.id) not in supervisor_ids:
                raise HTTPException(status_code=401, detail="Not the assigned supervisor in this exam session.")
        elif user_info.role == "examinee":
            # user_info 의 role 이 응시자라면 실제로 접수된 응시자 정보에 요청을 보낸 응시자의 id 가 존재하는지 확인합니다.
            examinee_ids: list[str] = [str(ee.id) for ee in exam.expected_examinees]
            if str(user_info.id) not in examinee_ids:
                raise HTTPException(status_code=401, detail="No information exists in the examinee list.")
        else:
            pass
        return user_info, exam_session


async def create_examinees_from_csv(csv_content: str) -> list[User]:
    """
    CSV 파일 내용을 읽어 User 객체 리스트를 생성합니다.
    CSV 파일에는 'email'과 'name' 열이 포함되어야 합니다.
    """
    users = []
    csv_file = StringIO(csv_content)
    reader = csv.DictReader(csv_file)

    for row in reader:
        if 'email' in row and 'name' in row:
            user = User(
                email=row['email'],
                name=row['name'],
                role="examinee",
                pwd=str(uuid.uuid4())
            )
            users.append(user)

    return users


import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

def send_email(recipients: list[dict]):
    """
    수신자 목록을 받아 시험 참가 URL과 비밀번호를 이메일로 전송합니다.
    recipients: [{'email': str, 'password': str, 'name': str}]
    """
    if not all([SMTP_SERVER, SMTP_PORT, EMAIL_ADDR, EMAIL_APP_PWD]):
        print("SMTP settings are not fully configured. Skipping email sending.")
        return

    try:
        smtp = smtplib.SMTP(SMTP_SERVER, int(SMTP_PORT))
        smtp.starttls()
        smtp.login(EMAIL_ADDR, EMAIL_APP_PWD)

        for user in recipients:
            email = user.get("email")
            password = user.get("password")
            name = user.get("name")
            id_ = user.get("id")
            if not all([email, password, name, id_]):
                continue

            msg = MIMEMultipart()
            msg['From'] = EMAIL_ADDR
            msg['To'] = email
            msg['Subject'] = f"[{user.get('role')}] Online Exam Invitation"
            # 비밀 번호를 Fernet 이 사용 가능한 url-safe 한 키로 만들기 위한 코드
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,  # Fernet 키의 길이인 32바이트로 설정
                salt=SALT.encode("utf-8"),
                iterations=480000,  # 반복 횟수 (NIST 권장 10,000 이상, 높을수록 안전)
            )
            derived_key = kdf.derive(password.encode('utf-8'))
            # 이 과정을 거치지 않으면 secrets.token_urlsafe(32) 를 사용해도 에러가 발생합니다.
            key64 = base64.urlsafe_b64encode(derived_key)
            f = Fernet(key64)
            encrypted_token = f.encrypt(id_.encode('utf-8'))
            url = f'http://localhost:5173/invite/join_exam/{encrypted_token.decode("utf-8")}'

            body = f"""
            Hello, {name}

            You have been invited to an online exam.

            Please use the following URL to access the exam:
            {url}

            Your password is: {password}

            Good luck!
            """
            msg.attach(MIMEText(body, 'plain'))
            smtp.sendmail(EMAIL_ADDR, email, msg.as_string())
            print(f"Successfully sent email to {email}")

        smtp.quit()
    except Exception as e:
        print(f"Failed to send email: {e}")
    return