import io
import httpx
from app.config import settings


def _headers():
    return {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_KEY,
    }


def upload_file(bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to Supabase Storage and return the storage path."""
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    headers = {**_headers(), "Content-Type": content_type, "x-upsert": "true"}
    with httpx.Client(timeout=30) as client:
        r = client.post(url, content=data, headers=headers)
        r.raise_for_status()
    return path


def get_signed_url(bucket: str, path: str, expires_in: int = 86400) -> str:
    """Return a signed download URL valid for expires_in seconds."""
    url = f"{settings.SUPABASE_URL}/storage/v1/object/sign/{bucket}/{path}"
    with httpx.Client(timeout=10) as client:
        r = client.post(url, json={"expiresIn": expires_in}, headers=_headers())
        r.raise_for_status()
        signed_path = r.json()["signedURL"]
    return f"{settings.SUPABASE_URL}/storage/v1{signed_path}"


def download_file(bucket: str, path: str) -> bytes:
    """Download file bytes from Supabase Storage."""
    url = f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    with httpx.Client(timeout=30) as client:
        r = client.get(url, headers=_headers())
        r.raise_for_status()
    return r.content


def get_public_url(bucket: str, path: str) -> str:
    return f"{settings.SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}"
