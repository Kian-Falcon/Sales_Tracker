import asyncio
import time
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import Settings, get_settings
from models.common import CurrentUser, Department

security = HTTPBearer(auto_error=False)
JWKS_CACHE_TTL_SECONDS = 900
JWKS_REQUEST_TIMEOUT_SECONDS = 5.0

_jwks_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_jwks_lock = asyncio.Lock()


def _get_cached_jwks(url: str) -> dict[str, Any] | None:
    cached = _jwks_cache.get(url)
    if cached is None:
        return None

    cached_at, payload = cached
    if time.time() - cached_at < JWKS_CACHE_TTL_SECONDS:
        return payload

    return None


async def fetch_jwks(settings: Settings) -> dict[str, Any]:
    if not settings.supabase_jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWKS_URL is not configured.",
        )

    cached = _get_cached_jwks(settings.supabase_jwks_url)
    if cached is not None:
        return cached

    async with _jwks_lock:
        cached = _get_cached_jwks(settings.supabase_jwks_url)
        if cached is not None:
            return cached

        stale = _jwks_cache.get(settings.supabase_jwks_url)

        try:
            async with httpx.AsyncClient(timeout=JWKS_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.get(settings.supabase_jwks_url)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            if stale is not None:
                return stale[1]

            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to verify Supabase token right now.",
            ) from exc

        _jwks_cache[settings.supabase_jwks_url] = (time.time(), payload)
        return payload


def _extract_department(payload: dict[str, Any]) -> Department:
    metadata = payload.get("user_metadata") or {}
    raw_department = metadata.get("department") or payload.get("department")
    if not raw_department:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Department claim is missing from token.")
    return Department(raw_department)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")

    token = credentials.credentials
    jwks = await fetch_jwks(settings)

    try:
        header = jwt.get_unverified_header(token)
        key = next((item for item in jwks.get("keys", []) if item.get("kid") == header.get("kid")), None)
        if key is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to match JWT signing key.")

        payload = jwt.decode(
            token,
            key,
            algorithms=[key.get("alg", "RS256")],
            audience="authenticated",
            options={"verify_at_hash": False},
        )
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token.") from exc

    return CurrentUser(
        user_id=payload["sub"],
        email=payload.get("email"),
        department=_extract_department(payload),
    )


def require_departments(*allowed: Department):
    async def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.department not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this action.")
        return user

    return dependency
