import duckdb
import flask

from . import DB_FILE
from .server_utils import _configure_logging


app = flask.Flask("backend")
_configure_logging()


@app.get("/")
async def index() -> flask.Response:
    return flask.jsonify({"status": "ok"})


@app.get("/api/data")
async def api_data() -> flask.Response:
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
            return flask.jsonify([])
    return flask.jsonify(rows.to_dicts())


@app.get("/api/ttc/<route_id>")
async def api_route(route_id: str) -> flask.Response:
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
            return flask.jsonify([])
    return flask.jsonify(rows.to_dicts())
