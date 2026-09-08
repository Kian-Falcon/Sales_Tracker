from fastapi import APIRouter, BackgroundTasks, Depends

from auth import require_departments
from config import Settings, get_settings
from database import get_pool
from models.common import CurrentUser, Department
from services.airtable_sync import sync_all_to_airtable

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


@router.post("/airtable/resync")
async def resync_airtable(
    background_tasks: BackgroundTasks = None,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    _user: CurrentUser = Depends(require_departments(Department.ADMIN)),
) -> dict[str, object]:
    project_count = await pool.fetchval(
        """
        SELECT COUNT(*)
        FROM projects
        WHERE is_archived = FALSE
        """
    )

    if not settings.airtable_sync_enabled:
        return {
            "enabled": False,
            "scheduled": False,
            "projects_considered": int(project_count or 0),
            "message": "Airtable sync is disabled. Set AIRTABLE_ACCESS_TOKEN and AIRTABLE_BASE_ID first.",
        }

    if background_tasks is not None:
        background_tasks.add_task(sync_all_to_airtable, pool, settings)
        return {
            "enabled": True,
            "scheduled": True,
            "projects_considered": int(project_count or 0),
            "message": "Airtable backfill has been queued.",
        }

    await sync_all_to_airtable(pool, settings)
    return {
        "enabled": True,
        "scheduled": False,
        "projects_considered": int(project_count or 0),
        "message": "Airtable backfill completed.",
    }
