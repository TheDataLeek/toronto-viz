workers = 1  # must be 1 — DuckDB allows only one writer (the scraper)
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:5000"
accesslog = "-"  # stdout → journald


def post_fork(server, worker):
    # Start the scraper inside the worker process, not the master
    from vizlib.scraper import start_scraper
    start_scraper()
