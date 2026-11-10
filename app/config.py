"""Runtime configuration."""
import os


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "local-dev-key-change-before-deploy")
    MAX_CONTENT_LENGTH = 2 * 1024 * 1024
    ENVIRONMENT = os.getenv("FLASK_ENV", "development")
    JSON_SORT_KEYS = False
