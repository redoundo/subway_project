from fastapi import APIRouter, Depends, UploadFile, File
from backend.core import AuthenticationChecker
from backend.db import User

precheck_router = APIRouter()


@precheck_router.post("/identity-verification")
async def identity_verification(
    user_info: User = Depends(AuthenticationChecker(role=["examinee"])),
    image: UploadFile = File(...)
):
    """
    사용자 신원 확인을 처리합니다.
    """
    return {"result": True}