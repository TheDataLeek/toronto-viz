FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY vizlib/ vizlib/
COPY main.py .
COPY deploy/gunicorn.conf.py deploy/gunicorn.conf.py
COPY deploy/backup.py deploy/backup.py
COPY deploy/docker-entrypoint.sh deploy/docker-entrypoint.sh
RUN chmod +x deploy/docker-entrypoint.sh

RUN mkdir -p data

EXPOSE 5000
CMD ["./deploy/docker-entrypoint.sh"]
