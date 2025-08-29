from bson import ObjectId

from backend.core import send_email, ExamSessionAuthenticationChecker
from fastapi import APIRouter, Depends, HTTPException, Response, Cookie
from backend.db import exam_crud, exam_session_crud, examinee_crud
from uuid import uuid4
from backend.db import ExamDetectRule, ExamSession, User, Examinee, Exam
from backend.db import Logs, logs_crud
from typing import Annotated

sessions_router = APIRouter()


@sessions_router.post(
    "/{exam_id}/create_session", summary="관리자 시험 세션 생성"
)
async def create_session(
    exam_id: str,
    response: Response,
    detect_rule: ExamDetectRule,
    info: tuple[User, ExamSession | None] = Depends(
        ExamSessionAuthenticationChecker(role=["admin"], session_id_required=False, exam_session_must_exist=False)
    )
):
    user, session = info
    if session:
        response.set_cookie(key="session_id", value=session.session_id)
        return {"session_id": session.session_id}

    exam: Exam = await exam_crud.get(ObjectId(exam_id))

    new_session_id = str(uuid4())
    new_session = ExamSession(
        session_id=new_session_id,
        exam=exam,
        detect_rule=detect_rule,
        session_status='draft'
    )
    await exam_session_crud.create(new_session)
    log = Logs(user=user, url_path="/session/create_session", log_type="SESSION_CREATED")
    await logs_crud.create(log)

    # Send invitation emails to proctors and examinees
    recipients = []
    # 응시자 정보 추가
    for examinee_user in exam.expected_examinees:
        recipients.append({
            "email": examinee_user.email,
            "password": examinee_user.pwd,
            "name": examinee_user.name,
            "role": "examinee",
            "id" : str(examinee_user.id)
        })

    # 감독관 정보 추가
    for proctor_user in exam.proctors:
        recipients.append({
            "email": proctor_user.email,
            "password": proctor_user.pwd,
            "name": proctor_user.name,
            "role": "supervisor",
            "id" : str(proctor_user.id)
        })

    if recipients:
        send_email(recipients)

    response.set_cookie(key="session_id", value=new_session_id)
    return {"session_id": new_session_id}


@sessions_router.get("/join_session/{exam_id}", summary="응시자 시험 세션 참여")
async def examinee_join_session(
    exam_id: str,
    response: Response,
    session_id: Annotated[str | None, Cookie()] = None,
    info: tuple[User, ExamSession] = Depends(
        ExamSessionAuthenticationChecker(role=["examinee"], session_id_required=False)
    )
):
    current_user, session = info

    # 그 다음, 해당 세션의 상태(session_status)가 'ready' 인지 확인합니다.
    # 'ready' 상태가 아니라면 에러를 발생시킵니다.
    if session.session_status != 'ready':
        raise HTTPException(status_code=400, detail="Session is not ready to be joined")

    if session_id is not None:
        # examinee_crud 를 사용하여 이미 해당 세션에 참여한 응시자인지 확인합니다.
        existing_examinee : Examinee | None = await examinee_crud.get_by(
            {'session_id': session_id, 'examinee._id': current_user.id}
        )
        if existing_examinee:
            return {"message": "User has already joined the session.", "examinee_info": existing_examinee.model_dump_json()}

    new_examinee = Examinee(
        session_id=session.session_id,
        exam_id=exam_id,
        examinee=current_user,
        status='connected'
    )

    await examinee_crud.create(new_examinee)
    # 세션 참여에 대한 로그를 남깁니다.
    log = Logs(user=current_user, url_path="/session/join_session", log_type="JOIN_SESSION")
    await logs_crud.create(log)

    # session_id 를 쿠키에 넣어 보냅니다.
    response.set_cookie(key="session_id", value=session.session_id)
    return {"message": "Successfully joined the session."}


@sessions_router.get("/supervisor_join_session/{exam_id}", summary="감독관 시험 참여 및 세션 준비")
async def supervisor_join_session(
    exam_id: str,
    response: Response,
    info: tuple[User, ExamSession] = Depends(
        ExamSessionAuthenticationChecker(role=["supervisor"], session_id_required=False)
    ),
):
    current_user, session = info

    # 5. 세션 상태가 참여 가능한지 확인합니다.
    if session.session_status not in ['draft', 'ready']:
        raise HTTPException(
            status_code=400,
            detail=f"세션에 참여할 수 있는 상태가 아닙니다. 현재 상태: {session.session_status}"
        )

    # 6. 세션이 'draft' 상태이면 'ready'로 업데이트합니다.
    if session.session_status == 'draft':
        await session.update({"$set": {"session_status": "ready"}})

        # 세션 준비 완료 로그를 생성합니다.
        log = Logs(
            user=current_user,
            url_path=f"/session/supervisor_join_session/{exam_id}",
            log_type="SESSION_READY"
        )
        await logs_crud.create(log)

        # 쿠키에 session_id를 설정하고 반환합니다.
        response.set_cookie(key="session_id", value=session.session_id)
        return {"message": "세션이 준비되었습니다.", "session_id": session.session_id}

    response.set_cookie(key="session_id", value=session.session_id)
    return {"message": "성공적으로 참여했습니다. 세션은 이미 준비 상태였습니다.", "session_id": session.session_id}


@sessions_router.get(
    path="/{exam_id}/examinees",
    summary="세션에 참여한 응시자 정보 가져오기",
    dependencies=[Depends(ExamSessionAuthenticationChecker(role=["supervisor"]))]
)
async def get_exist_examinee_infos(
    exam_id: str,
    session_id: Annotated[str, Cookie()]
):
    # 동일한 exam_id와 session_id를 가진 모든 Examinee를 가져옵니다.
    examinees: list[Examinee] = await examinee_crud.get_all({
        "exam_id": exam_id,
        "session_id": session_id
    })

    if not examinees:
        return []

    # Examinee의 이름과 ID(user_id)만 추출하여 반환합니다.
    examinee_infos = [
        {"id": str(examinee.examinee.id), "name": examinee.examinee.name}
        for examinee in examinees
    ]

    return examinee_infos
