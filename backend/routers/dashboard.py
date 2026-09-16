from fastapi import APIRouter, Depends

from auth import get_current_user
from database import get_pool
from models.common import CurrentUser
from models.project import DashboardSummary
from services.workflow_settings import load_stage_blueprint

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    pool=Depends(get_pool),
    user: CurrentUser = Depends(get_current_user),
) -> DashboardSummary:
    enabled_stage_keys = [template.stage_key for template in await load_stage_blueprint(pool)]
    totals = await pool.fetchrow(
        """
        SELECT
            COUNT(*) FILTER (WHERE is_archived = FALSE) AS total_projects,
            COALESCE((SELECT COUNT(*) FROM stages WHERE status = 'active' AND stage_key = ANY($1::text[])), 0) AS active_stages,
            COALESCE((SELECT COUNT(*) FROM stages WHERE status = 'overdue' AND stage_key = ANY($1::text[])), 0) AS overdue_stages,
            COALESCE((SELECT COUNT(*) FROM stages WHERE status = 'done' AND stage_key = ANY($1::text[])), 0) AS completed_stages
        FROM projects
        """,
        enabled_stage_keys,
    )

    return DashboardSummary(**dict(totals))
