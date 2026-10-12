"""Entry point: creates the FastAPI app and plugs in each group of endpoints.

Run it from the backend folder with:
    uvicorn app.main:app --reload
("app.main" = this file, ":app" = the variable below, --reload = restart on code changes)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import health

settings = get_settings()

app = FastAPI(
    title="IITK Lost & Found API",
    description="Report, find, claim and return lost items through campus security offices.",
    version="0.1.0",
)

# CORS: browsers block a page on one address (the Next.js site, port 3000)
# from calling an API on another (this API, port 8000) unless the API
# explicitly allows it. We allow only our own frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
