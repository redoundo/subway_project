from datetime import datetime
from beanie import Document
from typing import Optional , Literal
from pydantic import BaseModel, Field


class User(Document):
    """
    사용자(응시자, 감독관, 관리자)의 기본 정보를 저장합니다.
    """
    email: str
    name: str = Field(description="사용자 이름")
    role: Literal['examinee', 'supervisor', 'admin'] = Field(description="사용자 역할")
    pwd: str
    created_at: datetime = Field(default_factory=datetime.now, description="생성 일시")

    class Settings:
        name = "users"
        validate_on_save = True
        indexes : list = [
            "name", "role", "email"
        ]


class LoginRequest(Document):
    """
    로그인 요청 추적 용도. 10 분에 최대 5 번 로그인 요청이 가능하다.
    로그인 요청이 올 때마다 request_count 가 증가한다.
    last_request_time 과 현재 datetime 을 비교해서 10 분이 지났다면 1 로 초기화 한다.
    """
    user: User
    last_request_time: datetime
    request_count: int

    class Settings:
        name="login_requests"
        validate_on_save = True


class Examinee(Document):
    """
    세션에 참여한 응시자에 대한 정보
    """
    session_id: str = Field(description="참여한 시험 세션 ID")
    examinee: User
    exam_id: str
    join_time: datetime = Field(default_factory=datetime.now, description="응시자 참여 시간")
    status: Literal["connected", "disconnected", "active", "inactive"]
    updated_at: datetime = Field(default_factory=datetime.now)

    class Settings:
        name="examinee"
        validate_on_save = True
        indexes : list = [
            "session_id", "exam_id", "status"
        ]


class MediaFiles(BaseModel):
    media_type: Literal['face_snapshot', 'id_card_front', 'desk_view']
    media_url: str

class Verifications(Document):

    exam_id: str
    examinee_id: Examinee = Field(description="로그를 생성한 id")
    status: Literal["pending", "approved", "rejected"]
    media_files: list[MediaFiles]
    proctor_id: Optional[str] = None
    proctor_decision: Optional[Literal["approved", "rejected"]] = None
    reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)

    class Settings:
        name="verifications"
        validate_on_save = True
        indexes : list = [
            "proctor_id", "exam_id", "status"
        ]


class LogContent(BaseModel):
    content: str
    user_ids: list[str]

class Logs(Document):
    """
    Represents a log entry in the database.
    """
    user: User = Field(description="로그를 생성한 id")
    generated_at: datetime = Field(default_factory=datetime.now, description="로그 생성 일시")
    url_path: str = Field(description="The URL path of the request that generated the log.", min_length=1)
    log_type: str = Field(description="The type of log (e.g., VERIFY_REJECT, EXAM_START).", min_length=1)
    content: Optional[LogContent] = None

    class Settings:
        name = "logs"
        validate_on_save = True
        indexes : list = [
             "log_type", "url_path"
        ]

class EventData(BaseModel):
    message: str
    details: Optional[dict] = None

class EventLog(Document):
    """
    A log of all detected cheating events (by AI) and significant actions (by proctors). This is the source for the final report.
    """
    examinee: Examinee
    exam_id: str
    generated_at: datetime = Field(default_factory=datetime.now, description="The exact time the event occurred.")
    event_type: Literal['gaze_off_screen', 'window_switch', "audio_noise", "multiple_faces", 'prohibited_item_detected', 'proctor_snapshot', 'manual_flag']
    severity: Literal['low', 'medium', 'high', 'critical']
    content: EventData = Field(description="A detailed description of the event.")
    is_dismissed : bool = Field(description="`true` if a proctor reviewed and dismissed the event.")
    screenshot_url: str = Field(description="URL to the evidence snapshot stored in the cloud.")

    class Settings:
        name = "event_logs"
        validate_on_save = True
        indexes : list = [
            "severity", "event_type", "is_dismissed"
        ]


class FinalReport(Document):
    exam_id: str
    target_user_id: str = Field(description="보고서 대상의 user_id")
    created_datetime: datetime = Field(default_factory=datetime.now, description="보고서 생성 일시")
    report_url: str = Field(description="생성된 보고서가 위치한 경로")

class ExamQuestionSelection(BaseModel):
    question_id: str
    selection_count: int

class ExamQuestionBody(BaseModel):
    question_id: str = Field(description="시험 문항 아이디", min_length=5)
    body_base64: str = Field(description="시험 문항의 제목, 선택지, 보기 내용까지 이미지로 추출한 뒤 base64 로 변환한 값.", min_length=10)

class ExamQuestion(BaseModel):
    question_id: str = Field(description="시험 문항 아이디", min_length=5)
    question_index: int = Field(description="시험 문항 인덱스", gt=0)
    bodies: list[ExamQuestionBody]
    selection: ExamQuestionSelection = Field(description="실제 선택지가 아니다. 사용자의 선택지를 받아오기 위한 버튼의 개수가 담겨 있는 필드.")

class ExamContent(BaseModel):
    """
    시험지에 있는 시험 문항들과 기타 정보들.
    """
    exam_content_id: str
    schedule_id: str
    exam_id: str
    questions: list[ExamQuestion]

class Schedule(BaseModel):
    """
    시험 스케쥴 정보
    """
    schedule_id: str
    exam_id: str
    schedule_index: int = Field(description="몇 교시 스케줄인가요?")
    start_datetime: datetime = Field(description="스케줄 시작 시간")
    end_datetime: datetime
    content_id: str = Field(description="현재 스케줄이 사용할 시험지. 즉, exam_content_id")

class Exam(Document):
    """
    등록된 시험 정보
    """
    exam_title: str = Field(description="시험 제목")
    proctors: list[User] = Field(description="담당 감독관들의 ID")
    created_at: datetime = Field(default_factory=datetime.now, description="시험 정보 생성 일시")
    exam_start_datetime: datetime
    exam_end_datetime: datetime
    schedules: list[Schedule] = Field(description="각 교시 정보")
    contents: list[ExamContent] = Field(description="각 교시마다 사용할 시험지 내용")
    expected_examinees: list[User]

    class Settings:
        name = "exams"
        validate_on_save = True
        indexes : list = [
            "exam_title", "exam_start_datetime"
        ]

class ExamDetectRule(BaseModel):
    """
    부정 행위를 탐지할 방법 선택
    """
    detect_gaze_off_screen: bool
    detect_window_switch: bool
    detect_prohibited_items: bool
    detect_multiple_faces: bool
    detect_audio_noise: bool


class ExamSession(Document):
    """
    관리자에 의해 생성된 세션
    """
    session_id: str = Field(description="세션 고유 ID")
    created_at: datetime = Field(default_factory=datetime.now, description="세션 생성 일시")
    detect_rule: ExamDetectRule
    session_status: Literal['draft', 'ready', 'in_progress', 'paused', 'completed', 'archived']
    exam: Exam

    class Settings:
        name = "exam_sessions"
        validate_on_save = True
        indexes : list = [
            "session_id"
        ]

