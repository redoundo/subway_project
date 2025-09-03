# db/__init__.py

# Make the database connection function easily accessible
from backend.db.models import ExamDetectRule, ExamSession, LoginRequest, User, Examinee, MediaFiles, Verifications, Logs
from backend.db.models import EventData, EventLog, Exam, Schedule, ExamContent, ExamQuestion, LogContent
from backend.db.models import ExamQuestionSelection, ExamHTML, ExamQuestionSelectionLocation
from backend.db.models import AllExamAnswers, ExamAnswers, ChosenAnswer
from backend.db.database import lifespan
from backend.db.model_functions import user_crud, exam_session_crud, login_request_crud, examinee_crud
from backend.db.model_functions import verifications_crud, logs_crud, event_log_crud, MongoCRUD
from backend.db.model_functions import exam_crud, exam_answers_crud

# You can define an __all__ variable to specify what gets imported with 'from . import *'
# This helps control the namespace and makes the package's API explicit.
__all__ = [
    # database.py
    'lifespan', "exam_session_crud", "login_request_crud", "examinee_crud",
    "AllExamAnswers", "ExamAnswers", "ChosenAnswer", "exam_answers_crud",
    "ExamDetectRule", "ExamSession", "LoginRequest", "User",
    "Examinee", "MediaFiles", "Verifications", "Logs",
    "EventData", "EventLog", "verifications_crud", "logs_crud", "event_log_crud", "MongoCRUD",
    "ExamQuestionSelection", "ExamHTML", "ExamQuestionSelectionLocation", "user_crud",
    "Exam", "Schedule", "ExamContent", "ExamQuestion", "exam_crud", "LogContent"
]
