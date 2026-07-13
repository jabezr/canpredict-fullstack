"""
utils/logger.py
----------------
Central logging configuration. Import get_logger(__name__) from any module
instead of calling logging.getLogger directly, so formatting stays
consistent across the whole backend.
"""
import logging
import sys

from backend.config import get_settings

_configured = False


def _configure_root_logger() -> None:
    global _configured
    if _configured:
        return

    settings = get_settings()
    root = logging.getLogger()
    root.setLevel(settings.LOG_LEVEL)

    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    # Avoid duplicate handlers if this ever gets called twice.
    if not root.handlers:
        root.addHandler(handler)

    _configured = True


def get_logger(name: str) -> logging.Logger:
    _configure_root_logger()
    return logging.getLogger(name)
