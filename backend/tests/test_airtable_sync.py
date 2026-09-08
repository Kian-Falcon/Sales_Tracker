from datetime import date, datetime, timezone
from uuid import uuid4

from models.comment import CommentRead
from models.common import Department, ProjectDocumentType, ProjectPriority, StagePhase, StageStatus
from models.project import ProjectDetail, ProjectDocumentRead
from models.stage import StageDueDateChangeRequestRead, StageRead
from services.airtable import build_equals_any_formula
from services.airtable_sync import _build_project_record_fields


def test_build_equals_any_formula_escapes_single_quotes() -> None:
    formula = build_equals_any_formula("Project Code", ["P0001", "Client's Rollout"])

    assert formula == "OR({Project Code}='P0001',{Project Code}='Client\\'s Rollout')"


def test_project_record_fields_include_current_stage_and_boq_status() -> None:
    project_id = uuid4()
    synced_at = datetime(2026, 9, 5, 10, 15, tzinfo=timezone.utc)
    active_stage_id = uuid4()
    comment_id = uuid4()
    request_id = uuid4()

    project = ProjectDetail(
        id=project_id,
        project_code="P0042",
        name="North Rollout",
        client="Acme",
        assigned_person_name="Nirvaan",
        priority=ProjectPriority.ACCELERATED,
        estimated_tat_days=21,
        total_order_value=250000.0,
        special_request="Fast-track launch",
        created_by=uuid4(),
        created_by_name="Sales Lead",
        created_by_department=Department.SALES,
        created_at=datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc),
        is_archived=False,
        documents=[
            ProjectDocumentRead(
                id=uuid4(),
                project_id=project_id,
                document_type=ProjectDocumentType.BOQ,
                file_name="boq.pdf",
                content_type="application/pdf",
                file_size=1024,
                storage_bucket="project-documents",
                storage_path="projects/boq.pdf",
                uploaded_by=None,
                uploaded_by_name=None,
                download_url=None,
                created_at=datetime(2026, 9, 1, 8, 5, tzinfo=timezone.utc),
            )
        ],
        stages=[
            StageRead(
                id=active_stage_id,
                project_id=project_id,
                stage_key="costing_sop_logged",
                phase=StagePhase.COSTING,
                name="Costing SOP Logged In",
                responsible_dept=Department.SALES,
                status=StageStatus.ACTIVE,
                activated_at=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc),
                due_date=date(2026, 9, 8),
                completed_at=None,
                completed_by=None,
                sort_order=10,
                comments=[
                    CommentRead(
                        id=comment_id,
                        stage_id=active_stage_id,
                        user_id=uuid4(),
                        department=Department.SALES,
                        author_name="Sales Lead",
                        text="Kickoff note",
                        created_at=datetime(2026, 9, 1, 9, 10, tzinfo=timezone.utc),
                    )
                ],
                due_date_requests=[
                    StageDueDateChangeRequestRead(
                        id=request_id,
                        stage_id=active_stage_id,
                        requested_by=uuid4(),
                        requested_by_department=Department.SALES,
                        requestor_name="Sales Lead",
                        current_due_date=date(2026, 9, 8),
                        requested_due_date=date(2026, 9, 9),
                        reason="Customer asked for a day shift",
                        status="pending",
                        reviewed_by=None,
                        reviewer_name=None,
                        review_note=None,
                        reviewed_at=None,
                        created_at=datetime(2026, 9, 1, 9, 20, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 9, 1, 9, 20, tzinfo=timezone.utc),
                    )
                ],
            ),
            StageRead(
                id=uuid4(),
                project_id=project_id,
                stage_key="costing_bom_prepared",
                phase=StagePhase.COSTING,
                name="BOM Prepared by R&D",
                responsible_dept=Department.RD,
                status=StageStatus.PENDING,
                activated_at=None,
                due_date=None,
                completed_at=None,
                completed_by=None,
                sort_order=15,
                comments=[],
                due_date_requests=[],
            ),
        ],
    )

    fields = _build_project_record_fields(
        project,
        synced_at=synced_at,
        project_url=f"https://tracker.example/projects/{project_id}",
    )

    assert fields["Tracker Project Id"] == str(project_id)
    assert fields["Current Stage Name"] == "Costing SOP Logged In"
    assert fields["Current Stage Phase"] == "costing"
    assert fields["Current Stage Department"] == Department.SALES.value
    assert fields["Current Stage Status"] == "active"
    assert fields["Completed Stages"] == 0
    assert fields["Pending Stages"] == 1
    assert fields["Overdue Stages"] == 0
    assert fields["Document Count"] == 1
    assert fields["Has BOQ"] is True
    assert fields["Project URL"] == f"https://tracker.example/projects/{project_id}"
    assert fields["Last Synced At"] == synced_at.isoformat()
