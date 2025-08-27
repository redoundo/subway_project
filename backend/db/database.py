from contextlib import asynccontextmanager
import asyncio

from bson import ObjectId
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

async def find_product():
    # 데이터베이스 연결 및 Beanie 초기화
    client = AsyncMongoClient(uri)
    await init_beanie(
        database=client.get_database(db_name),  # 사용할 데이터베이스
        document_models=[
            ExamSession, LoginRequest, User, Examinee, Verifications,
            Logs, EventLog, Exam
        ]  # 맵핑할 Document 클래스 목록
    )

    # find_one을 사용하여 가격이 10보다 작은 제품 하나를 찾음
    # user = await User.find_one({"email": "44ii@gmail.com", "_id": ObjectId("689d5828f633c4d7a76c4354")}, fetch_links=True)
    login_req = await LoginRequest.find_one({"user._id": ObjectId("689d5828f633c4d7a76c4354"), "user.email": "44ii@gmail.com"})
    print(login_req, dir(login_req))


if __name__ == "__main__":
    asyncio.run(find_product())