from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def readiness_check(request: Request) -> dict[str, str]:
    db_pool = getattr(request.app.state, "db_pool", None)
    return {"status": "ready" if db_pool is not None else "degraded"}
