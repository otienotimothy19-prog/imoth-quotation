"""Document storage abstraction. Only a local-disk backend is implemented,
but callers only depend on this module's functions (save_bytes / read_bytes
/ public_url), so swapping in an S3-compatible backend later means changing
this file only -- no caller needs to change.
"""
import hashlib
import os
import re
import uuid
from pathlib import Path

from app.core.config import settings

# Anything outside this set is stripped from a client-supplied filename
# before it touches the filesystem. This blocks path traversal (e.g. a
# filename of "../../etc/cron.d/evil" or an embedded "/") and control
# characters, while keeping the extension and a readable stem.
_UNSAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


def sanitize_filename(filename: str | None, *, fallback: str = "file") -> str:
    """Reduce a client-supplied filename to a safe basename with no path
    separators or traversal sequences. Never trust this value for anything
    other than a display label -- storage paths always prefix it with a
    random UUID (see save_bytes)."""
    name = os.path.basename((filename or "").strip().replace("\\", "/"))
    name = _UNSAFE_FILENAME_CHARS.sub("_", name).strip("._") or fallback
    return name[:200]


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

    safe_name = f"{uuid.uuid4().hex}_{sanitize_filename(filename)}"
    path = target_dir / safe_name
    path.write_bytes(content)

    checksum = hashlib.sha256(content).hexdigest()
    relative_path = os.path.join(subdir, safe_name)
    return relative_path, checksum


def read_bytes(storage_path: str) -> bytes:
    """Read a file previously written by save_bytes. `storage_path` is
    always a value this module generated (never taken verbatim from a
    request), but resolved-path containment is still checked as a
    defence-in-depth measure against a corrupted/tampered stored path."""
    root = _root().resolve()
    path = (root / storage_path).resolve()
    if root not in path.parents and path != root:
        raise ValueError("Invalid storage path")
    return path.read_bytes()


def absolute_path(storage_path: str) -> Path:
    return _root() / storage_path


def public_url(storage_path: str) -> str:
    return f"{settings.STORAGE_PUBLIC_BASE_URL}/{storage_path}"
