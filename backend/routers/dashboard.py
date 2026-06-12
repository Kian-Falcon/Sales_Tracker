from fastapi import APIRouter, Depends

from auth import get_current_user
from database import get_pool
from models.common import CurrentUser
from models.project import DashboardSummary

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    pool=Depends(get_pool),
    user: CurrentUser = Depends(get_current_user),
) -> DashboardSummary:
    totals = await pool.fetchrow(
        """
        SELECT
            COUNT(*) FILTER (WHERE is_archived = FALSE) AS total_projects,
            COALESCE((SELECT COUNT(*) FROM stages WHERE status = 'active'), 0) AS active_stages,
            COALESCE((SELECT COUNT(*) FROM stages WHERE status = 'overdue'), 0) AS overdue_stages,
            COALESCE((SELECT COUNT(*) FROM stages WHERE status = 'done'), 0) AS completed_stages
        FROM projects
        """
    )

    return DashboardSummary(**dict(totals))
