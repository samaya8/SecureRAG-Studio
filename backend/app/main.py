from fastapi import FastAPI

from app.routes.query import router as query_router

from app.routes.ingest import router as ingest_router
from app.routes.retrieve import router as retrieve_router

app = FastAPI(
    title="SecureRAG Backend",
    description="Backend API for SecureRAG Studio",
    version="1.0.0",
)

app.include_router(ingest_router)
app.include_router(retrieve_router)
app.include_router(query_router)


@app.get("/")
def root():
    return {"message": "SecureRAG Backend is running"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "SecureRAG Backend",
    }