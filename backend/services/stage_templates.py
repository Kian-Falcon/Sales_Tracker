from models.common import Department, StagePhase
from models.stage import StageTemplate


# default_due_days is the working window allowed for a stage once it becomes active;
# it seeds stage.due_date so the overdue-detection scheduler has something to compare against.
# These windows are implementation defaults and can be tuned later without changing stage order.
DEFAULT_STAGE_BLUEPRINT: list[StageTemplate] = [
    StageTemplate(stage_key="costing_sop_logged", phase=StagePhase.COSTING, name="Costing SOP Logged In", responsible_dept=Department.SALES, sort_order=10, default_due_days=1),
    StageTemplate(stage_key="costing_shared_rd", phase=StagePhase.COSTING, name="Costing Shared by R&D", responsible_dept=Department.RD, sort_order=20, default_due_days=3),
    StageTemplate(stage_key="costing_revision_items", phase=StagePhase.COSTING, name="Costing Revision / Additional Items", responsible_dept=Department.RD, sort_order=30, default_due_days=3),
    StageTemplate(stage_key="costing_client_approved", phase=StagePhase.COSTING, name="Costing Approved by Client", responsible_dept=Department.SALES, sort_order=40, default_due_days=2),
    StageTemplate(stage_key="drawing_sop_logged", phase=StagePhase.DRAWING, name="Drawing SOP Logged In", responsible_dept=Department.SALES, sort_order=50, default_due_days=1),
    StageTemplate(stage_key="drawings_prepared_rd", phase=StagePhase.DRAWING, name="Drawings Prepared by R&D", responsible_dept=Department.RD, sort_order=60, default_due_days=4),
    StageTemplate(stage_key="drawings_shared_client", phase=StagePhase.DRAWING, name="Drawings Shared with Client", responsible_dept=Department.SALES, sort_order=70, default_due_days=1),
    StageTemplate(stage_key="drawing_revision_items", phase=StagePhase.DRAWING, name="Drawing Revisions / Additional Items", responsible_dept=Department.RD, sort_order=80, default_due_days=4),
    StageTemplate(stage_key="drawings_client_approved", phase=StagePhase.DRAWING, name="Drawings Approved by Client", responsible_dept=Department.SALES, sort_order=90, default_due_days=2),
    StageTemplate(stage_key="sample_sop_logged", phase=StagePhase.SAMPLING, name="Sample SOP Logged In", responsible_dept=Department.SALES, sort_order=100, default_due_days=1),
    StageTemplate(stage_key="sample_development_started", phase=StagePhase.SAMPLING, name="Sample Development Started by R&D", responsible_dept=Department.RD, sort_order=110, default_due_days=2),
    StageTemplate(stage_key="sample_completed_rd", phase=StagePhase.SAMPLING, name="Sample Completed by R&D", responsible_dept=Department.RD, sort_order=120, default_due_days=5),
    StageTemplate(stage_key="samples_shared_client", phase=StagePhase.SAMPLING, name="Samples Shared with Client", responsible_dept=Department.DISPATCH, sort_order=130, default_due_days=2),
    StageTemplate(stage_key="sample_revisions_requested", phase=StagePhase.SAMPLING, name="Sample Revisions Requested", responsible_dept=Department.SALES, sort_order=140, default_due_days=2),
    StageTemplate(stage_key="revised_samples_started", phase=StagePhase.SAMPLING, name="Revised Samples Started by R&D", responsible_dept=Department.RD, sort_order=150, default_due_days=2),
    StageTemplate(stage_key="revised_samples_completed", phase=StagePhase.SAMPLING, name="Revised Samples Completed", responsible_dept=Department.RD, sort_order=160, default_due_days=4),
    StageTemplate(stage_key="sample_client_approved", phase=StagePhase.SAMPLING, name="Sample Approved by Client", responsible_dept=Department.SALES, sort_order=170, default_due_days=2),
    StageTemplate(stage_key="order_sop_logged_production", phase=StagePhase.PRODUCTION, name="Order SOP Logged Into Production", responsible_dept=Department.PRODUCTION, sort_order=180, default_due_days=1),
    StageTemplate(stage_key="bom_ordered_production", phase=StagePhase.PRODUCTION, name="BOM Ordered by Production", responsible_dept=Department.PRODUCTION, sort_order=190, default_due_days=2),
    StageTemplate(stage_key="raw_material_procurement_completed", phase=StagePhase.PRODUCTION, name="Raw Material Procurement Completed", responsible_dept=Department.PROCUREMENT, sort_order=200, default_due_days=4),
    StageTemplate(stage_key="production_started", phase=StagePhase.PRODUCTION, name="Production Started", responsible_dept=Department.PRODUCTION, sort_order=210, default_due_days=2),
    StageTemplate(stage_key="production_completed", phase=StagePhase.PRODUCTION, name="Production Completed", responsible_dept=Department.PRODUCTION, sort_order=220, default_due_days=7),
    StageTemplate(stage_key="qc_completed", phase=StagePhase.PRODUCTION, name="QC Completed", responsible_dept=Department.QC, sort_order=230, default_due_days=2),
    StageTemplate(stage_key="dispatch_completed", phase=StagePhase.PRODUCTION, name="Dispatch Completed", responsible_dept=Department.DISPATCH, sort_order=240, default_due_days=2),
]


# Lookup used when a stage transitions to active so its due_date can be seeded.
DUE_DAYS_BY_STAGE_KEY: dict[str, int] = {
    template.stage_key: template.default_due_days
    for template in DEFAULT_STAGE_BLUEPRINT
    if template.default_due_days is not None
}
