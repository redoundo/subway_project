from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from backend.db import (
    Exam,
    User,
    ExamSession,
    ExamContent,
    ExamHTML,
    ExamQuestion,
    ExamQuestionSelection,
    ExamQuestionSelectionLocation,
    Schedule, ExamDetectRule
)
from backend.db import exam_crud, exam_session_crud, user_crud
from backend.core import AuthenticationChecker, create_examinees_from_csv, build_exam_html_and_index
from typing import List, Optional, Literal
from uuid import uuid4
from secrets import token_urlsafe
from datetime import datetime, timedelta
import json
import os
import tempfile
from bson import ObjectId
from pydantic import BaseModel, Field

exam_router = APIRouter()


class ExamCardInfo(BaseModel):
    exam_id: str = Field(description="시험 ID", min_length=5)
    exam_start_datetime: datetime = Field(description="시험 시작 시간")
    exam_end_datetime: datetime = Field(description="시험 종료 시간")
    exam_title: str = Field(description="시험 제목", min_length=1)

class ExamSessionCardInfo(ExamCardInfo):
    session_id: str = Field(description="ExamSession.session_id 값", min_length=1)
    session_status: Literal['draft', 'ready', 'in_progress', 'paused', 'completed', 'archived'] = Field(description="시험 세션의 상태")
    detection_rule: ExamDetectRule

def extract_information(exams: list[Exam | ExamSession]) -> List[ExamCardInfo]:
    if len(exams) == 0:
        return []
    extracted: list[ExamCardInfo] = []
    for ex in exams:
        if (not isinstance(ex, Exam)) and (not isinstance(ex, ExamSession)):
            continue

        if isinstance(ex, Exam):
            extracted.append(
                ExamCardInfo(
                    exam_id=str(ex.id), exam_start_datetime=ex.exam_start_datetime,
                    exam_end_datetime=ex.exam_end_datetime, exam_title=ex.exam_title
                )
            )
            continue

        extracted.append(
            ExamSessionCardInfo(
                exam_title=ex.exam.exam_title, exam_id=str(ex.exam.id),
                exam_start_datetime=ex.exam.exam_start_datetime, exam_end_datetime=ex.exam.exam_end_datetime,
                session_id=ex.session_id, session_status=ex.session_status, detection_rule=ex.detect_rule
            )
        )

    return extracted


@exam_router.get(
    "/admin", response_model=dict[str, List[ExamCardInfo]],
    dependencies=[Depends(AuthenticationChecker(role=["admin"]))]
)
async def get_exams_for_admin():
    """
    Returns all existing Exam information for an admin.
    """
    exams: list[Exam] = await exam_crud.get_all(limit=1000)
    exam_sessions: list[ExamSession] = await exam_session_crud.get_all(limit=1000)

    # 이미 exam_session 에 있는 exam 들은 제외.
    # TODO : 너무 난잡함. 더 나은 방법이 있는지 확인 필요.
    exam_sessions_exam_ids: list[str] = [str(exs.exam.id) for exs in exam_sessions]
    exams = [ex for ex in exams if str(ex.id) not in exam_sessions_exam_ids]

    extracted_exams: List[ExamCardInfo] = extract_information(exams)
    extracted_sessions: List[ExamCardInfo] = extract_information(exam_sessions)
    return  {"exam": extracted_exams, "session": extracted_sessions}


@exam_router.get(
    "/get_exam/{exam_id}", response_model=Exam,
    dependencies=[Depends(AuthenticationChecker(role=["admin", "examinee", "supervisor"]))]
)
async def get_exam_for_admin(exam_id: str):
    """
    Returns a single Exam object for an admin.
    """
    exam = await exam_crud.get(ObjectId(exam_id))
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


@exam_router.get("/supervisor", response_model=List[ExamSession])
async def get_exams_for_supervisor(user_info: User = Depends(AuthenticationChecker(role=['supervisor']))):
    """
    Returns Exam information for which the supervisor is assigned as a proctor.
    """
    # Find sessions where the current supervisor is a proctor
    return  await exam_session_crud.get_all(query={"exam.proctors._id": user_info.id}, limit=1000)


@exam_router.get("/examinee", response_model=List[ExamSession])
async def get_exams_for_examinee(user_info: User = Depends(AuthenticationChecker(role=['examinee']))):
    """
    Returns Exam information for which the examinee is an expected participant.
    """
    return await exam_session_crud.get_all(query={
            "exam.expected_examinees._id": user_info.id
        }, limit=1000
    )


@exam_router.post(
    "/admin/create_exams",
    response_model=Exam,
    dependencies=[Depends(AuthenticationChecker(role=["admin"]))],
)
async def create_exams(
    title: str = Form(..., description="Exam title"),
    start_time: str = Form(..., description="Exam start ISO datetime"),
    end_time: str = Form(..., description="Exam end ISO datetime"),
    supervisor_infos: str = Form(..., description="JSON array or dict of {name,email}"),
    examinee_infos: UploadFile = File(..., description="CSV of examinees"),
    exam_papers: List[UploadFile] = File(..., description="PDF files, one per period"),
    exam_duration_time: int = Form(..., description="Duration per period in minutes"),
    break_time: int = Form(..., description="Break time between periods in minutes"),
):
    """
    Creates an Exam along with Users (proctors and examinees), parses PDFs to HTML and index,
    and constructs ExamContent and Schedules.

    :param title 시험 제목(str 타입)
    :param start_time: 시험 시작 datetime(시험이 처음 시작 될 때를 의미합니다.)
    :param end_time: 시험 종료 datetime(시험이 완전히 종료 될 때를 의미합니다.)
    :param supervisor_infos : 시험 감독관의 email, 이름(json,dict,str 셋 중에 하나의 타입)
    :param examinee_infos : 응시자 정보가 들어 있는 csv 파일(file, multipart 타입. 경로만 전달하는 건 절대 금지.)
    :param exam_papers : 시험 문항들이 들어 있는 pdf 파일(list[file|multipart...] 타입. 경로만 전달 하는 건 절대 금지.)
    :param exam_duration_time : 시험 진행 시간(한 교시 당 몇 분 동안 시험을 보는지)(int)
    :param break_time: 쉬는 시간(한 교시마다 몇 분 동안 쉬는지)(int)
    """
    print(title, start_time, end_time, supervisor_infos, examinee_infos, exam_papers, exam_duration_time, break_time)
    try:
        exam_start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        exam_end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid startTime/endTime format")

    # Parse supervisors (accept JSON array or single object)
    try:
        if not supervisor_infos:
            proctor_items = []
        else:
            loaded = json.loads(supervisor_infos)
            if isinstance(loaded, dict):
                proctor_items = [loaded]
            elif isinstance(loaded, list):
                proctor_items = loaded
            else:
                raise ValueError
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid supervisor_infos JSON")

    # Create or fetch proctor users
    proctor_docs: List[User] = []
    for p in proctor_items:
        email = (p.get("email") or "").strip()
        pname = (p.get("name") or "").strip()
        if not email or not pname:
            raise HTTPException(status_code=422, detail="Proctor name and email are required")
        existing = await user_crud.get_by({"email": email, "role": "supervisor"})
        if existing:
            proctor_docs.append(existing)
        else:
            new_user = User(email=email, name=pname, role="supervisor", pwd=str(token_urlsafe(32)))
            created = await user_crud.create(new_user)
            proctor_docs.append(created)

    # Create or fetch examinee users from CSV
    examinee_docs: List[User] = []
    if examinee_infos is None:
        raise HTTPException(status_code=403, detail="examinee information file are required")

    content = (await examinee_infos.read()).decode("utf-8", errors="ignore")
    parsed = await create_examinees_from_csv(content)
    for u in parsed:
        existing = await user_crud.get_by({"email": u.email, "role": "examinee"})
        if existing:
            examinee_docs.append(existing)
        else:
            created = await user_crud.create(u)
            examinee_docs.append(created)

    # Validate periods and files
    pdf_files = exam_papers or []
    if len(pdf_files) == 0:
        raise HTTPException(status_code=422, detail="At least one PDF file is required")

    # Build period start/end times using duration/break and count of PDFs
    period_count = len(pdf_files)
    if exam_duration_time <= 0:
        raise HTTPException(status_code=422, detail="exam_duration_time must be positive minutes")
    if break_time < 0:
        raise HTTPException(status_code=422, detail="break_time must be >= 0 minutes")

    period_times: List[tuple[datetime, datetime]] = []
    cursor = exam_start
    for i in range(period_count):
        p_start = cursor
        p_end = p_start + timedelta(minutes=int(exam_duration_time))
        period_times.append((p_start, p_end))
        cursor = p_end
        if i < period_count - 1:
            cursor = cursor + timedelta(minutes=int(break_time))
    # Use computed end time to ensure consistency
    computed_exam_end = period_times[-1][1]
    exam_end = computed_exam_end

    # Process each PDF: build HTML and index
    contents: List[ExamContent] = []
    schedules: List[Schedule] = []

    for idx, (period_start, period_end) in enumerate(period_times):
        upload: UploadFile = pdf_files[idx]
        # Persist to a temp file to pass a path to converter
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tf:
            pdf_tmp_path = tf.name
            tf.write(await upload.read())

        try:
            result = build_exam_html_and_index(pdf_tmp_path, output_html_path=None, return_html_string=True)
        except Exception as e:
            # Cleanup and fail
            try:
                os.remove(pdf_tmp_path)
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=f"Failed to process PDF index/html: {e}")
        finally:
            # Remove temp PDF after processing
            try:
                os.remove(pdf_tmp_path)
            except Exception:
                pass

        html_str: str = result.get("html") or ""
        pages_map = result.get("pages") or {}

        # Extract pf pages from html
        page_divs: List[str] = []
        import re as _re
        # pdf2htmlEX 는 대부분의 html 파일을 다음과 같은 형태로 생성 합니다.
        # 이전 hthml 내용...
        # <div id="page-container">
        #   <div id="pf1" class="pf w0 h0" data-page-no="1">pdf 내용...</div>
        #   <div id="pf2" class="pf w0 h0" data-page-no="2">pdf 내용...</div>
        #   <div id="pf3" class="pf w0 h0" data-page-no="3">pdf 내용...</div>
        #                       ...
        #   <div id="pf[0-9]+" class="pf w0 h0" data-page-no="[0-9]+">pdf 내용...</div>
        # </div>
        # <div class="loading-indicator"></div>
        # 이후 html 내용...
        # regex 의 패턴 중 하나인 `<div[^>]*id=\"pf[0-9]+\"[^>]*>.*?</div>[\n ]*?(?=<div id=\"pf)` 은
        # `<div id="pf1" class="pf w0 h0" data-page-no="1">pdf 내용...</div>\n <div id="pf` 값을 찾아 줍니다.
        # 또다른 regex 의 패턴인 `<div[^>]*id=\"pf[0-9]+\"[^>]*>.*?</div>[\n ]*?</div>[\n ]*?(?=<div class=\"loading-indicator\">)` 는
        # <div id="page-container"> 태그가 가진 마지막 태그인 <div id="pf[0-9]+" class="pf w0 h0" data-page-no="[0-9]+">pdf 내용...</div> 태그를 찾기 위해 사용됩니다. 첫 번째 패턴은 맨 마지막 태그를 찾지 못하니까요.
        # 그래서 <div id="page-container"> 의 닫힘 </div> 태그를 추가하고 <div class="loading-indicator"> 를 기준으로 하여 맨 마지막 태그를 찾습니다.
        for m in _re.finditer(r"<div[^>]*id=\"pf[0-9]+\"[^>]*>.*?</div>[\n ]*?(?=<div id=\"pf)|<div[^>]*id=\"pf[0-9]+\"[^>]*>.*?</div>[\n ]*?</div>[\n ]*?(?=<div class=\"loading-indicator\">)", html_str, flags=_re.DOTALL | _re.IGNORECASE):
            page_divs.append(m.group())
        if len(page_divs) > 1:
            # 이 코드가 바로 <div id="page-container"> 의 닫음 태그를 삭제하는 코드입니다.
            page_divs[-1] = "</div>".join(page_divs[-1].split("</div>")[:-1])
        # Build ExamHTMLs with questions from pages_map
        exam_htmls: List[ExamHTML] = []
        for p_idx, page_html in enumerate(page_divs, start=1):
            page_key = str(p_idx) + "@_@" + str(uuid4())
            qmap = pages_map.get(page_key, {})
            questions_list: List[ExamQuestion] = []
            for qid_str, opts in qmap.items():
                try:
                    q_index = int(qid_str.split("@_@")[0])
                except Exception:
                    q_index = 0
                eq = ExamQuestion(
                    question_id=qid_str,
                    question_index=q_index,
                    selection=[],
                )
                for opt_key, rect in opts.items():
                    try:
                        sel_index = int(opt_key)
                    except Exception:
                        continue
                    loc = ExamQuestionSelectionLocation(
                        x0=float(rect.get("x0", 0.0)),
                        y0=float(rect.get("y0", 0.0)),
                        x1=float(rect.get("x1", 0.0)),
                        y1=float(rect.get("y1", 0.0)),
                    )
                    sel = ExamQuestionSelection(
                        question_id=qid_str,
                        selection_index=sel_index,
                        location=loc,
                    )
                    eq.selection.append(sel)
                questions_list.append(eq)
            exam_htmls.append(ExamHTML(html=page_html, questions=questions_list, page_index=p_idx))

        if not exam_htmls:
            p_idx = 1
            page_key = str(p_idx)
            qmap = pages_map.get(page_key, {})
            questions_list: List[ExamQuestion] = []
            for qid_str, opts in qmap.items():
                try:
                    q_index = int(qid_str)
                except Exception:
                    q_index = 0
                eq = ExamQuestion(
                    question_id=qid_str,
                    question_index=q_index,
                    selection=[],
                )
                for opt_key, rect in opts.items():
                    try:
                        sel_index = int(opt_key)
                    except Exception:
                        continue
                    loc = ExamQuestionSelectionLocation(
                        x0=float(rect.get("x0", 0.0)),
                        y0=float(rect.get("y0", 0.0)),
                        x1=float(rect.get("x1", 0.0)),
                        y1=float(rect.get("y1", 0.0)),
                    )
                    sel = ExamQuestionSelection(
                        question_id=qid_str,
                        selection_index=sel_index,
                        location=loc,
                    )
                    eq.selection.append(sel)
                questions_list.append(eq)
            exam_htmls.append(ExamHTML(html=html_str, questions=questions_list, page_index=p_idx))

        outer_html = html_str

        content_id = str(uuid4())
        schedule_id = str(uuid4())

        contents.append(
            ExamContent(
                exam_content_id=content_id,
                schedule_id=schedule_id,
                outer_html=outer_html,
                htmls=exam_htmls,
            )
        )
        schedules.append(
            Schedule(
                schedule_id=schedule_id,
                schedule_index=idx + 1,
                start_datetime=period_start,
                end_datetime=period_end,
                content_id=content_id,
            )
        )

    if not title or not proctor_docs or not contents or not schedules:
        raise HTTPException(status_code=422, detail="Missing required exam fields")

    exam = Exam(
        exam_title=title,
        proctors=proctor_docs,
        exam_start_datetime=exam_start,
        exam_end_datetime=exam_end,
        schedules=schedules,
        contents=contents,
        expected_examinees=examinee_docs,
        exam_duration_time=int(exam_duration_time),
        break_time=int(break_time),
    )

    return await exam_crud.create(exam)


@exam_router.put(
    "/admin/update_exam/{exam_id}",
    response_model=Exam,
    dependencies=[Depends(AuthenticationChecker(role=["admin"]))],
)
async def update_exams(
    exam_id: str,
    title: str = Form(..., description="Exam title"),
    start_time: str = Form(..., description="Exam start ISO datetime"),
    end_time: str = Form(..., description="Exam end ISO datetime"),
    supervisor_infos: str = Form(..., description="JSON array or dict of {name,email}"),
    examinee_infos: Optional[UploadFile] = File(None, description="CSV of examinees"),
    exam_papers: Optional[List[UploadFile]] = File(None, description="PDF files, one per period"),
    exam_duration_time: int = Form(..., description="Duration per period in minutes"),
    break_time: int = Form(..., description="Break time between periods in minutes"),
):
    """
    Updates an existing Exam. CSV/PDF are optional; when provided, they drive
    updates to expected_examinees and schedules/contents respectively.
    Proctors are reconciled against the provided list (add missing, remove absent).
    """
    # Fetch existing exam
    existing_exam = await exam_crud.get(exam_id)
    if not existing_exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Parse base fields
    try:
        exam_start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        exam_end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid startTime/endTime format")

    # Parse supervisors (accept JSON array or single object)
    try:
        if not supervisor_infos:
            proctor_items = []
        else:
            loaded = json.loads(supervisor_infos)
            if isinstance(loaded, dict):
                proctor_items = [loaded]
            elif isinstance(loaded, list):
                proctor_items = loaded
            else:
                raise ValueError
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid supervisor_infos JSON")

    # Helper to build contents/schedules from PDFs (same logic as create)
    async def _build_contents_and_schedules(
        period_times_in: List[tuple[datetime, datetime]], pdf_files_in: List[UploadFile]
    ) -> tuple[List[ExamContent], List[Schedule]]:
        if len(period_times_in) == 0 or len(pdf_files_in) == 0:
            raise HTTPException(status_code=422, detail="At least one exam period and PDF file are required")
        if len(pdf_files_in) != len(period_times_in):
            raise HTTPException(status_code=422, detail="Number of PDF files must match number of periods")

        contents_acc: List[ExamContent] = []
        schedules_acc: List[Schedule] = []

        for idx, (period_start, period_end) in enumerate(period_times_in):
            upload: UploadFile = pdf_files_in[idx]
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tf:
                pdf_tmp_path = tf.name
                tf.write(await upload.read())

            try:
                result = build_exam_html_and_index(pdf_tmp_path, output_html_path=None, return_html_string=True)
            except Exception as e:
                try:
                    os.remove(pdf_tmp_path)
                except Exception:
                    pass
                raise HTTPException(status_code=500, detail=f"Failed to process PDF index/html: {e}")
            finally:
                try:
                    os.remove(pdf_tmp_path)
                except Exception:
                    pass

            html_str: str = result.get("html") or ""
            pages_map = result.get("pages") or {}

            # Extract page divs
            page_divs: List[str] = []
            import re as _re
            for m in _re.finditer(r"<div[^>]*id=\"pf[0-9]+\"[^>]*>.*?</div>[\n ]*?(?=<div id=\"pf)|<div[^>]*id=\"pf[0-9]+\"[^>]*>.*?</div>[\n ]*?</div>[\n ]*?(?=<div class=\"loading-indicator\">)", html_str, flags=_re.DOTALL | _re.IGNORECASE):
                page_divs.append(m.group())

            exam_htmls: List[ExamHTML] = []
            for p_idx, page_html in enumerate(page_divs, start=1):
                page_key = str(p_idx)
                qmap = pages_map.get(page_key, {})
                questions_list: List[ExamQuestion] = []
                for qid_str, opts in qmap.items():
                    try:
                        q_index = int(qid_str)
                    except Exception:
                        q_index = 0
                    eq = ExamQuestion(
                        question_id=qid_str,
                        question_index=q_index,
                        selection=[],
                    )
                    for opt_key, rect in opts.items():
                        try:
                            sel_index = int(opt_key)
                        except Exception:
                            continue
                        loc = ExamQuestionSelectionLocation(
                            x0=float(rect.get("x0", 0.0)),
                            y0=float(rect.get("y0", 0.0)),
                            x1=float(rect.get("x1", 0.0)),
                            y1=float(rect.get("y1", 0.0)),
                        )
                        sel = ExamQuestionSelection(
                            question_id=qid_str,
                            selection_index=sel_index,
                            location=loc,
                        )
                        eq.selection.append(sel)
                    questions_list.append(eq)
                exam_htmls.append(ExamHTML(html=page_html, questions=questions_list, page_index=p_idx))

            if not exam_htmls:
                p_idx = 1
                page_key = str(p_idx)
                qmap = pages_map.get(page_key, {})
                questions_list: List[ExamQuestion] = []
                for qid_str, opts in qmap.items():
                    try:
                        q_index = int(qid_str)
                    except Exception:
                        q_index = 0
                    eq = ExamQuestion(
                        question_id=qid_str,
                        question_index=q_index,
                        selection=[],
                    )
                    for opt_key, rect in opts.items():
                        try:
                            sel_index = int(opt_key)
                        except Exception:
                            continue
                        loc = ExamQuestionSelectionLocation(
                            x0=float(rect.get("x0", 0.0)),
                            y0=float(rect.get("y0", 0.0)),
                            x1=float(rect.get("x1", 0.0)),
                            y1=float(rect.get("y1", 0.0)),
                        )
                        sel = ExamQuestionSelection(
                            question_id=qid_str,
                            selection_index=sel_index,
                            location=loc,
                        )
                        eq.selection.append(sel)
                    questions_list.append(eq)
                exam_htmls.append(ExamHTML(html=html_str, questions=questions_list, page_index=p_idx))

            outer_html = html_str

            content_id = str(uuid4())
            schedule_id = str(uuid4())

            contents_acc.append(
                ExamContent(
                    exam_content_id=content_id,
                    schedule_id=schedule_id,
                    outer_html=outer_html, # TODO: 원래 html 을 그대로 사용하고 있습니다. 변경 필요
                    htmls=exam_htmls,
                )
            )
            schedules_acc.append(
                Schedule(
                    schedule_id=schedule_id,
                    schedule_index=idx + 1,
                    start_datetime=period_start,
                    end_datetime=period_end,
                    content_id=content_id,
                )
            )

        return contents_acc, schedules_acc

    # Reconcile proctors
    new_proctors: List[User] = []
    incoming_emails = set()
    for p in proctor_items:
        email = (p.get("email") or "").strip()
        pname = (p.get("name") or "").strip()
        if not email or not pname:
            raise HTTPException(status_code=422, detail="Proctor name and email are required")
        incoming_emails.add(email)
        existing_user = await user_crud.get_by({"email": email, "role": "supervisor"})
        if existing_user:
            # Update name if changed
            if existing_user.name != pname:
                existing_user.name = pname
                await existing_user.save()
            new_proctors.append(existing_user)
        else:
            created = await user_crud.create(User(email=email, name=pname, role="supervisor", pwd=str(token_urlsafe(32))))
            new_proctors.append(created)

    # Remove supervisors not in incoming list
    for old in existing_exam.proctors:
        if old.email not in incoming_emails:
            try:
                await user_crud.delete(old.id)
            except Exception:
                pass

    # Reconcile examinees if CSV provided
    new_examinees: List[User] = list(existing_exam.expected_examinees)
    if examinee_infos is not None:
        csv_content = (await examinee_infos.read()).decode("utf-8", errors="ignore")
        parsed_users = await create_examinees_from_csv(csv_content)
        # Build maps
        incoming_examinee_emails = {u.email for u in parsed_users}
        current_by_email = {u.email: u for u in existing_exam.expected_examinees}

        # Add or update
        created_or_found: List[User] = []
        for u in parsed_users:
            existing_u = await user_crud.get_by({"email": u.email, "role": "examinee"})
            if existing_u:
                # Update name if changed
                if existing_u.name != u.name:
                    existing_u.name = u.name
                    await existing_u.save()
                created_or_found.append(existing_u)
            else:
                created = await user_crud.create(User(email=u.email, name=u.name, role="examinee", pwd=str(token_urlsafe(32))))
                created_or_found.append(created)

        # Remove examinees not in CSV
        for old_email, old_user in current_by_email.items():
            if old_email not in incoming_examinee_emails:
                try:
                    await user_crud.delete(old_user.id)
                except Exception:
                    pass

        new_examinees = created_or_found

    # Build contents and schedules if PDFs provided; otherwise keep existing
    # Compute target period times from duration/break and number of periods
    period_count = len(exam_papers) if exam_papers else len(existing_exam.contents)
    if exam_duration_time <= 0:
        raise HTTPException(status_code=422, detail="exam_duration_time must be positive minutes")
    if break_time < 0:
        raise HTTPException(status_code=422, detail="break_time must be >= 0 minutes")
    period_times: List[tuple[datetime, datetime]] = []
    cursor = exam_start
    for i in range(period_count):
        p_start = cursor
        p_end = p_start + timedelta(minutes=int(exam_duration_time))
        period_times.append((p_start, p_end))
        cursor = p_end
        if i < period_count - 1:
            cursor = cursor + timedelta(minutes=int(break_time))
    # Align provided end_time with computed schedule
    exam_end = period_times[-1][1]

    updated_contents = list(existing_exam.contents)
    updated_schedules = [
        Schedule(
            schedule_id=str(uuid4()) if i >= len(existing_exam.schedules) else existing_exam.schedules[i].schedule_id,
            schedule_index=i + 1,
            start_datetime=pt[0],
            end_datetime=pt[1],
            content_id=str(uuid4()) if i >= len(existing_exam.contents) else existing_exam.contents[i].exam_content_id,
        )
        for i, pt in enumerate(period_times)
    ]
    # Rebuild contents only if new PDFs provided
    if exam_papers:
        contents_built, schedules_built = await _build_contents_and_schedules(period_times, exam_papers)
        updated_contents = contents_built
        updated_schedules = schedules_built

    # Build updated Exam model
    updated_exam = Exam(
        exam_title=title,
        proctors=new_proctors,
        created_at=existing_exam.created_at,
        exam_start_datetime=exam_start,
        exam_end_datetime=exam_end,
        schedules=updated_schedules,
        contents=updated_contents,
        expected_examinees=new_examinees,
        exam_duration_time=int(exam_duration_time),
        break_time=int(break_time),
    )

    saved = await exam_crud.update(ObjectId(exam_id), updated_exam)
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to update exam")
    return saved
