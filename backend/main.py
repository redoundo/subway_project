from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio, sys

path: str = __file__
path = path.replace("\\", "/")
path = "/".join(path.split("/")[:-3])
sys.path.append(path)
sys.path.append(path + "/backend")
sys.path.append(path + "/backend/api")
sys.path.append(path + "/backend/core")
sys.path.append(path + "/backend/db")

from backend.db import lifespan
from backend.api import auth_router, exam_router, sessions_router, reports_router, precheck_router
from backend.api import sio, on_exam_router

# FastAPI application
app = FastAPI(lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your frontend's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(exam_router, prefix="/api/exams", tags=["Exams"])
app.include_router(sessions_router, prefix="/api/sessions", tags=["Sessions"])
app.include_router(reports_router, prefix="/api/reports", tags=["Reports"])
app.include_router(precheck_router, prefix="/api/pre-checks", tags=["Pre-checks"])
app.include_router(on_exam_router, prefix="/api/on-exams", tags=["On-Exams"])

# Create Socket.IO ASGI app
socket_app = socketio.ASGIApp(sio)

# Mount the Socket.IO app on the main FastAPI app
app.mount("/", socket_app)

@app.get("/")
async def root():
    return {"message": "Online Monitoring System API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
