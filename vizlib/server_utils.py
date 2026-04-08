import logging

from loguru import logger

class _InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


class _TLSNoiseFilter(logging.Filter):
    """Drop 'Bad request version' 400s — HTTPS clients hitting the HTTP server."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "Bad request version" not in record.getMessage()


def _configure_logging() -> None:
    logging.basicConfig(handlers=[_InterceptHandler()], level=0, force=True)
    werkzeug_log = logging.getLogger("werkzeug")
    werkzeug_log.handlers = [_InterceptHandler()]
    werkzeug_log.propagate = False  # prevent double-logging via root handler
    werkzeug_log.addFilter(_TLSNoiseFilter())


