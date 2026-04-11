from pathlib import Path

API_URL = (
    "https://retro.umoiq.com/service/publicJSONFeed?command=vehicleLocations&a=ttc"
)
SCRAPE_INTERVAL = 60
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_FILE = DATA_DIR / "backend.db"
SAMPLE_DATA_FILE = DATA_DIR / "sample_data.json"

from . import data, db, routes, scraper, server, util
