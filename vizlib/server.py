import duckdb
from fastapi import FastAPI, Path, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from . import DB_FILE
from .server_utils import _configure_logging

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_configure_logging()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://thedataleek.github.io"],
    allow_methods=["GET"],
    allow_headers=[],
)


@app.get("/")
async def index():
    return {"status": "ok"}


@app.get("/api/data")
@limiter.limit("30/minute")
async def api_data(request: Request):
    with duckdb.connect(str(DB_FILE), read_only=True) as conn:
        try:
            rows = conn.execute(
                """
                SELECT DISTINCT ON (id)
                *
                FROM vehicles
                ORDER BY id, api_timestamp DESC
                """
            ).pl()
        except duckdb.CatalogException:
            return []
    return rows.to_dicts()


@app.get("/api/ttc/{route_id}")
@limiter.limit("60/minute")
async def api_route(
    request: Request,
    route_id: str = Path(pattern=r"^\d{1,4}[A-Z]{0,2}$"),
):
    with duckdb.connect(str(DB_FILE), read_only=True) as conn:
        try:
            rows = conn.execute(
                """
                SELECT DISTINCT ON (id)
                *
                FROM vehicles
                WHERE routeTag = ?
                ORDER BY id, api_timestamp DESC
                """,
                [route_id],
            ).pl()
        except duckdb.CatalogException:
            return []
    return rows.to_dicts()
