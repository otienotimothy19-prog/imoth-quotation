"""Document storage abstraction. Only a local-disk backend is implemented,
but callers only depend on this module's functions (save_bytes / read_bytes
/ public_url), so swapping in an S3-compatible backend later means changing
this file only -- no caller needs to change.
"""
import hashlib
import os
import uuid
from pathlib import Path

from app.core.config import settings


def _root() -> Path:
    root = Path(settings.STORAGE_LOCAL_PATH)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_bytes(content: bytes, *, subdir: str, filename: str) -> tuple[str, str]:
    """Persist `content` under storage/<subdir>/<uuid>_<filename>.
    Returns (storage_path, checksum)."""
    if settings.STORAGE_BACKEND != "local":
        raise NotImplementedError(f"Unsupported STORAGE_BACKEND={settings.STORAGE_BACKEND!r}")

    target_dir = _root() / subdir
    target_dir.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}_{filename}"
    path = target_dir / safe_name
    path.write_bytes(content)

    checksum = hashlib.sha256(content).hexdigest()
    relative_path = os.path.join(subdir, safe_name)
    return relative_path, checksum


def read_bytes(storage_path: str) -> bytes:
    path = _root() / storage_path
    return path.read_bytes()


def absolute_path(storage_path: str) -> Path:
    return _root() / storage_path


def public_url(storage_path: str) -> str:
    return f"{settings.STORAGE_PUBLIC_BASE_URL}/{storage_path}"
