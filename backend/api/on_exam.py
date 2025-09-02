from bson import ObjectId
from fastapi import APIRouter
from backend.db import Exam
from backend.db import exam_crud

on_exam_router = APIRouter()

@on_exam_router.get(
    path="/test_drive/{exam_id}",
    description="시험 응시 화면이 잘 렌더링 되는지 확인하기 위해 ExamSession 의 Exam 값을 제공해주는 메서드입니다.",
    response_model=Exam
)
async def exam_paper_screen_test(exam_id: str):
    exam: Exam | None = await exam_crud.get_by({"_id": ObjectId(exam_id)})
    return exam.model_dump() if exam is not None else {}


