from backend.core import ExamSessionAuthenticationChecker
from fastapi import APIRouter, Depends
from backend.db import User, ExamSession, event_log_crud, EventLog, examinee_crud, Examinee

reports_router = APIRouter()

@reports_router.get(path="/{exam_id}", description="리포트 대시보드에 필요한 EventLogs 반환")
async def get_reports(
        exam_id: str, 
        info: tuple[User, ExamSession] = Depends(ExamSessionAuthenticationChecker(role=["supervisor"]))
):
    user, session = info
    event_logs: list[EventLog] = await event_log_crud.get_all({"exam_id": exam_id, "examinee.session_id": session.session_id})
    examinees: list[Examinee] = await examinee_crud.get_all({"exam_id": exam_id, "session_id": session.session_id})
    return {
        "exam_start_time": session.exam.exam_start_datetime,
        "exam_end_time" : session.exam.exam_end_datetime,
        "examinees" : [ei.model_dump() for ei in examinees],
        "event_logs" : [el.model_dump() for el in event_logs],
    }