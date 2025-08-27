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
    Schedule,
)
from backend.db import exam_crud, exam_session_crud, user_crud
from backend.core import AuthenticationChecker, create_examinees_from_csv, build_exam_html_and_index
from typing import List, Optional
from uuid import uuid4
from datetime import datetime
import json
import os
import tempfile
from bson import ObjectId

exam_router = APIRouter()


@exam_router.get(
    "/admin", response_model=List[Exam],
    dependencies=[Depends(AuthenticationChecker(role=["admin"]))]
)
async def get_exams_for_admin():
    """
    Returns all existing Exam information for an admin.
    """
    return await exam_crud.get_all(limit=1000)  # Increased limit to fetch more exams if needed


@exam_router.get(
    "/admin/get_exam/{exam_id}", response_model=Exam,
    dependencies=[Depends(AuthenticationChecker(role=["admin"]))]
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
    return  await exam_session_crud.get_all(query={"proctors._id": user_info.id}, limit=1000)


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
    name: str = Form(..., description="Exam title"),
    start_time: str = Form(..., description="Exam start ISO datetime"),
    end_time: str = Form(..., description="Exam end ISO datetime"),
    proctors: str = Form(..., description="JSON array of {name,email}"),
    papers: str = Form(..., description="JSON array of period metas with startTime,endTime"),
    examinees: Optional[UploadFile] = File(None, description="CSV of examinees"),
    paper_files: Optional[List[UploadFile]] = File(None, description="PDF files, one per period"),
):
    """
    Creates an Exam along with Users (proctors and examinees), parses PDFs to HTML and index,
    and constructs ExamContent and Schedules.
    """
    try:
        exam_start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        exam_end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid startTime/endTime format")

    try:
        proctor_items = json.loads(proctors) if proctors else []
        periods_meta = json.loads(papers) if papers else []
        if not isinstance(proctor_items, list) or not isinstance(periods_meta, list):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid proctors/papers JSON")

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
            new_user = User(email=email, name=pname, role="supervisor", pwd=str(uuid4()))
            created = await user_crud.create(new_user)
            proctor_docs.append(created)

    # Create or fetch examinee users from CSV
    examinee_docs: List[User] = []
    if examinees is not None:
        content = (await examinees.read()).decode("utf-8", errors="ignore")
        parsed = await create_examinees_from_csv(content)
        for u in parsed:
            existing = await user_crud.get_by({"email": u.email, "role": "examinee"})
            if existing:
                examinee_docs.append(existing)
            else:
                created = await user_crud.create(u)
                examinee_docs.append(created)

    # Validate periods and files
    pdf_files = paper_files or []
    if len(periods_meta) == 0 or len(pdf_files) == 0:
        raise HTTPException(status_code=422, detail="At least one exam period and PDF file are required")
    if len(pdf_files) != len(periods_meta):
        raise HTTPException(status_code=422, detail="Number of PDF files must match number of periods")

    # Process each PDF: build HTML and index
    contents: List[ExamContent] = []
    schedules: List[Schedule] = []

    for idx, meta in enumerate(periods_meta):
        try:
            period_start = datetime.fromisoformat(meta["startTime"].replace("Z", "+00:00"))
            period_end = datetime.fromisoformat(meta["endTime"].replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=422, detail=f"Invalid period datetime at index {idx}")

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
        for m in _re.finditer(r"<div[^>]*id=\"pf[0-9]+\"[^>]*>.*?</div>[\n ]*?(?=<div id=\"pf)|<div[^>]*id=\"pf[0-9]+\"[^>]*>.*?</div>[\n ]*?</div>[\n ]*?(?=<div class=\"loading-indicator\">)", html_str, flags=_re.DOTALL | _re.IGNORECASE):
            page_divs.append(m.group())
        if len(page_divs) > 1:
            page_divs[-1] = "</div>".join(page_divs[-1].split("</div>")[:-1])
        # Build ExamHTMLs with questions from pages_map
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
                    eq = ExamQuestion(
                        question_id=qid_str,
                        question_index=q_index,
                        selection=sel,
                    )
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
                    eq = ExamQuestion(
                        question_id=qid_str,
                        question_index=q_index,
                        selection=sel,
                    )
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

    if not name or not proctor_docs or not contents or not schedules:
        raise HTTPException(status_code=422, detail="Missing required exam fields")

    exam = Exam(
        exam_title=name,
        proctors=proctor_docs,
        exam_start_datetime=exam_start,
        exam_end_datetime=exam_end,
        schedules=schedules,
        contents=contents,
        expected_examinees=examinee_docs,
    )

    created = await exam_crud.create(exam)
    return created


@exam_router.put(
    "/admin/update_exam/{exam_id}",
    response_model=Exam,
    dependencies=[Depends(AuthenticationChecker(role=["admin"]))],
)
async def update_exams(
    exam_id: str,
    name: str = Form(..., description="Exam title"),
    start_time: str = Form(..., description="Exam start ISO datetime"),
    end_time: str = Form(..., description="Exam end ISO datetime"),
    proctors: str = Form(..., description="JSON array of {name,email}"),
    papers: str = Form(..., description="JSON array of period metas with startTime,endTime"),
    examinees: Optional[UploadFile] = File(None, description="CSV of examinees"),
    paper_files: Optional[List[UploadFile]] = File(None, description="PDF files, one per period"),
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

    try:
        proctor_items = json.loads(proctors) if proctors else []
        periods_meta = json.loads(papers) if papers else []
        if not isinstance(proctor_items, list) or not isinstance(periods_meta, list):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid proctors/papers JSON")

    # Helper to build contents/schedules from PDFs (same logic as create)
    async def _build_contents_and_schedules(
        periods_meta_in: List[dict], pdf_files_in: List[UploadFile]
    ) -> tuple[List[ExamContent], List[Schedule]]:
        if len(periods_meta_in) == 0 or len(pdf_files_in) == 0:
            raise HTTPException(status_code=422, detail="At least one exam period and PDF file are required")
        if len(pdf_files_in) != len(periods_meta_in):
            raise HTTPException(status_code=422, detail="Number of PDF files must match number of periods")

        contents_acc: List[ExamContent] = []
        schedules_acc: List[Schedule] = []

        for idx, meta in enumerate(periods_meta_in):
            try:
                period_start = datetime.fromisoformat(meta["startTime"].replace("Z", "+00:00"))
                period_end = datetime.fromisoformat(meta["endTime"].replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(status_code=422, detail=f"Invalid period datetime at index {idx}")

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
                        eq = ExamQuestion(
                            question_id=qid_str,
                            question_index=q_index,
                            selection=sel,
                        )
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
                        eq = ExamQuestion(
                            question_id=qid_str,
                            question_index=q_index,
                            selection=sel,
                        )
                        questions_list.append(eq)
                exam_htmls.append(ExamHTML(html=html_str, questions=questions_list, page_index=p_idx))

            outer_html = html_str

            content_id = str(uuid4())
            schedule_id = str(uuid4())

            contents_acc.append(
                ExamContent(
                    exam_content_id=content_id,
                    schedule_id=schedule_id,
                    outer_html=outer_html,
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
            created = await user_crud.create(User(email=email, name=pname, role="supervisor", pwd=str(uuid4())))
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
    if examinees is not None:
        csv_content = (await examinees.read()).decode("utf-8", errors="ignore")
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
                created = await user_crud.create(User(email=u.email, name=u.name, role="examinee", pwd=str(uuid4())))
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
    updated_contents = list(existing_exam.contents)
    updated_schedules = list(existing_exam.schedules)
    if paper_files:
        contents_built, schedules_built = await _build_contents_and_schedules(periods_meta, paper_files)
        updated_contents = contents_built
        updated_schedules = schedules_built

    # Build updated Exam model
    updated_exam = Exam(
        exam_title=name,
        proctors=new_proctors,
        created_at=existing_exam.created_at,
        exam_start_datetime=exam_start,
        exam_end_datetime=exam_end,
        schedules=updated_schedules,
        contents=updated_contents,
        expected_examinees=new_examinees,
    )

    saved = await exam_crud.update(ObjectId(exam_id), updated_exam)
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to update exam")
    return saved
