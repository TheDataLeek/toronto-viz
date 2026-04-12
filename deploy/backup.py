#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "duckdb",
#   "loguru",
# ]
# ///

import datetime
from pathlib import Path

import duckdb
from loguru import logger


def main() -> None:
    db_path, backup_dir = resolve_paths()
    if not db_path.exists():
        logger.warning("No DB at {} — skipping", db_path)
        return

    backup_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    backup_path = backup_dir / f"{today}.db"

    if backup_path.exists():
        logger.info("Backup for {} already exists — skipping", today)
        return

    checkpoint(db_path)
    copy_vehicles(db_path, backup_path)
    verify(backup_path)


def resolve_paths() -> tuple[Path, Path]:
    install_dir = Path(__file__).parent.parent
    return install_dir / "data" / "backend.db", install_dir / "data" / "backups"


def checkpoint(db_path: Path) -> None:
    conn = duckdb.connect(str(db_path))
    conn.execute("CHECKPOINT")
    conn.close()
    logger.info("Checkpoint complete")


def copy_vehicles(db_path: Path, backup_path: Path) -> None:
    conn = duckdb.connect(str(db_path))
    conn.execute(f"ATTACH '{backup_path}' AS backup")
    conn.execute("CREATE TABLE backup.vehicles AS SELECT * FROM vehicles")
    conn.execute("DETACH backup")
    conn.close()
    logger.info("Copied vehicles → {}", backup_path)


def verify(backup_path: Path) -> None:
    try:
        conn = duckdb.connect(str(backup_path))
        conn.execute("SELECT * FROM vehicles LIMIT 1").fetchall()
        conn.close()
        logger.info("Integrity check passed: {}", backup_path)
    except Exception as e:
        logger.error("Integrity check FAILED: {}", e)


if __name__ == "__main__":
    main()
