from contextlib import asynccontextmanager

from dotenv import load_dotenv
import os
from fastapi import FastAPI
from pymongo import AsyncMongoClient
from beanie import init_beanie
from typing import TypeVar
from backend.db import User, Examinee, Verifications, Logs, ExamSession
from backend.db import Exam, LoginRequest, EventLog

load_dotenv()

uri = os.getenv("MONGO_DB_URL")
db_name: str = os.getenv("MONGO_DB_NAME")

client = AsyncMongoClient(uri)
T = TypeVar("T")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 애플리케이션 시작 시 실행될 코드
    print("애플리케이션 시작...")

    # init_beanie를 사용하여 데이터베이스 연결 및 초기화
    await init_beanie(
        database=client.get_database(db_name),  # 사용할 데이터베이스
        document_models=[
            ExamSession, LoginRequest, User, Examinee, Verifications,
            Logs, EventLog, Exam
        ]  # 맵핑할 Document 클래스 목록
    )

    print("Beanie 초기화 완료.")

    yield  # 👈 이 시점에서 애플리케이션이 실행됨

    # 애플리케이션 종료 시 실행될 코드
    print("애플리케이션 종료...")
    await client.close()
