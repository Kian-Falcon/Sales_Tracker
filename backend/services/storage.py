import re
from pathlib import Path
from uuid import UUID, uuid4

import httpx

from config import Settings

ALLOWED_PROJECT_DOCUMENT_EXTENSIONS = {
    ".csv",
    ".doc",
    ".docx",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".txt",
    ".xls",
    ".xlsx",
    ".zip",
}


class StorageServiceError(RuntimeError):
    pass


def normalize_filename(filename: str) -> str:
    raw_name = Path(filename).name.strip()
    stem = Path(raw_name).stem or "document"
    suffix = Path(raw_name).suffix.lower()
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-._") or "document"
    return f"{safe_stem}{suffix}"


def is_supported_project_document(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_PROJECT_DOCUMENT_EXTENSIONS


def build_project_document_path(project_id: UUID, filename: str, document_type: str) -> str:
    safe_filename = normalize_filename(filename)
    return f"{project_id}/{document_type}/{uuid4()}-{safe_filename}"


def _storage_headers(settings: Settings, content_type: str | None = None) -> dict[str, str]:
    if not settings.supabase_service_key:
        raise StorageServiceError("SUPABASE_SERVICE_KEY is not configured.")

    headers = {
        "apikey": settings.supabase_service_key,
        "Authorization": f"Bearer {settings.supabase_service_key}",
    }

    if content_type:
        headers["Content-Type"] = content_type

    return headers


def _storage_base_url(settings: Settings) -> str:
    if not settings.supabase_url:
        raise StorageServiceError("SUPABASE_URL is not configured.")

    return f"{settings.supabase_url.rstrip('/')}/storage/v1"


async def upload_storage_object(
    settings: Settings,
    *,
    bucket: str,
    path: str,
    content: bytes,
    content_type: str,
) -> None:
    url = f"{_storage_base_url(settings)}/object/{bucket}/{path}"
    headers = {
        **_storage_headers(settings, content_type),
        "x-upsert": "false",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers, content=content)

    if response.status_code >= 400:
        raise StorageServiceError(f"Storage upload failed: {response.text or response.reason_phrase}")


async def delete_storage_object(settings: Settings, *, bucket: str, path: str) -> None:
    url = f"{_storage_base_url(settings)}/object/{bucket}/{path}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.delete(url, headers=_storage_headers(settings))

    if response.status_code >= 400 and response.status_code != 404:
        raise StorageServiceError(f"Storage cleanup failed: {response.text or response.reason_phrase}")


async def create_signed_download_url(settings: Settings, *, bucket: str, path: str) -> str:
    url = f"{_storage_base_url(settings)}/object/sign/{bucket}/{path}"
    payload = {"expiresIn": settings.project_documents_signed_url_ttl_seconds}

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, headers=_storage_headers(settings), json=payload)

    if response.status_code >= 400:
        raise StorageServiceError(f"Signed URL generation failed: {response.text or response.reason_phrase}")

    body = response.json()
    signed_url = body.get("signedURL") or body.get("signedUrl") or body.get("url")
    if not signed_url:
        raise StorageServiceError("Storage service did not return a signed URL.")

    if signed_url.startswith("http://") or signed_url.startswith("https://"):
        return signed_url

    return f"{_storage_base_url(settings)}{signed_url}"
