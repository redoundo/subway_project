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
            "severity", "event_type", "is_dismissed", "exam_id"
        ]


class ChosenAnswer(BaseModel):
    question_id: str = Field(description="문항의 아이디", min_length=3)
    chosen_selection: int = Field(description="응시자가 현재 문항에서 선택한 답안의 번호 1~5 사이의 값", ge=1, le=5)

class ExamAnswers(BaseModel):
    schedule_id: str = Field(description="현재 시험 스케줄의 id", min_length=3)
    exam_content_id: str = Field(description="시험의 정확한 id 값. 스케줄 id 까지 포함하기에 exam_id 와는 다르다. 물론 스케줄이 하나만 있을 경우는 제외", min_length=3)
    answers: list[ChosenAnswer] = Field(description="현재 시험에서 응시자가 제출한 답안들의 모음.", min_length=1)

class AllExamAnswers(Document):
    exam_id: str = Field(description="답안을 제출한 시험의 id", min_length=3)
    user_id: str = Field(description="답안을 제출한 응시자의 id", min_length=3)
    all_answers: list[ExamAnswers] = Field(description="시험을 한 번에 여러 번 칠 경우, 스케줄이 여러 개가 생기는데, 이런 경우를 감안해 list 로 만듦.", min_length=1)

    class Settings:
        name = "exam_answers"
        validate_on_save = True
        indexes : list = [
            "exam_id", "user_id"
        ]

class ExamQuestionSelectionLocation(BaseModel):
    x0: float
    x1: float
    y0: float
    y1: float

class ExamQuestionSelection(BaseModel):
    question_id: str
    selection_index: int
    location: ExamQuestionSelectionLocation

class ExamQuestion(BaseModel):
    question_id: str = Field(description="시험 문항 아이디")
    question_index: int = Field(description="시험 문항 번호", gt=0)
    selection: list[ExamQuestionSelection] = Field(description="pdf 를 html 로 바꾼 뒤, 그 위에 버튼을 정해진 위치에 맵핑합니다. ")

class ExamHTML(BaseModel):
    html: str = Field(description="id='page-container' 내부에 있는 id='pf[0-9]+' 값을 가진 div 태그입니다.")
    questions: list[ExamQuestion]
    page_index: int = Field(gt=0)

class ExamContent(BaseModel):
    """
    시험지에 있는 시험 문항들과 기타 정보들.
    """
    exam_content_id: str
    schedule_id: str
    outer_html: str = Field(description="id='page-container' 를 가진 div 태그 그 자체와 id='page-container' 바깥에 있는 모든 html 태그를 의미 합니다.")
    htmls: list[ExamHTML] = Field(description="id='pf[0-9]+' 를 가진 모든 div 태그를 의미 합니다.")
    html_width: float = Field(description="기본 가로 길이인 1095.25", default=1095.25)
    html_height: float = Field(description="기본 세로 높이인 1548.95 * 시험 페이지 수")

class Schedule(BaseModel):
    """
    시험 스케쥴 정보
    """
    schedule_id: str
    schedule_index: int = Field(description="몇 교시 스케줄인가요?")
    start_datetime: datetime = Field(description="스케줄 시작 시간")
    end_datetime: datetime
    content_id: str = Field(description="현재 스케줄이 사용할 시험지. 즉, exam_content_id")

class Exam(Document):
    """
    등록된 시험 정보
    """
    exam_title: str = Field(description="시험 제목")
    proctors: list[User] = Field(description="담당 감독관들")
    created_at: datetime = Field(default_factory=datetime.now, description="시험 정보 생성 일시")
    exam_start_datetime: datetime
    exam_end_datetime: datetime
    schedules: list[Schedule] = Field(description="각 교시 정보")
    contents: list[ExamContent] = Field(description="각 교시마다 사용할 시험지 내용")
    expected_examinees: list[User]
    exam_duration_time: int = Field(description="시험 진행 시간(한 교시 당 몇 분 동안 시험을 보는지)")
    break_time: int = Field(description="쉬는 시간(한 교시마다 몇 분 동안 쉬는지)")

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
    detect_gaze_off_screen: bool = Field(description="시선 화면 이탈")
    detect_window_switch: bool = Field(description="창 전환")
    detect_prohibited_items: bool = Field(description="금지 물품")
    detect_multiple_faces: bool = Field(description="응시자 외 인원")
    detect_audio_noise: bool = Field(description="소음 감지")


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

