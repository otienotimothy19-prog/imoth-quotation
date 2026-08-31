import logging

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.limiter import limiter
from app.api.routers import (
    admin_dashboard,
    admin_insurers,
    admin_motor_classes,
    admin_quotations,
    admin_rates,
    admin_risk_notes,
    admin_settings,
    admin_users,
    auth,
    client_documents,
    client_quotations,
)

logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
logger = logging.getLogger("imoth")

app = FastAPI(
    title=settings.APP_NAME,
    description="Imoth Insurance Brokers Motor Quotation & Risk Note System API",
    version="1.0.0",
)

app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Too many requests. Please try again shortly."})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": exc.errors()},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.mount(settings.STORAGE_PUBLIC_BASE_URL, StaticFiles(directory=settings.STORAGE_LOCAL_PATH), name="files")

app.include_router(auth.router)
app.include_router(client_quotations.router)
app.include_router(client_documents.router)
app.include_router(admin_dashboard.router)
app.include_router(admin_quotations.router)
app.include_router(admin_risk_notes.router)
app.include_router(admin_insurers.router)
app.include_router(admin_motor_classes.router)
app.include_router(admin_rates.router)
app.include_router(admin_settings.router)
app.include_router(admin_users.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}
