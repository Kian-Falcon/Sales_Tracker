CREATE TABLE IF NOT EXISTS workflow_stage_settings (
  stage_key TEXT PRIMARY KEY,
  phase TEXT NOT NULL CHECK (phase IN ('costing', 'drawing', 'sampling', 'production')),
  name TEXT NOT NULL,
  responsible_dept TEXT NOT NULL CHECK (responsible_dept IN ('Sales', 'R&D', 'Production', 'Procurement', 'QC', 'Dispatch', 'Admin')),
  sort_order INT NOT NULL UNIQUE,
  default_due_days INT CHECK (default_due_days IS NULL OR default_due_days >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workflow_stage_settings (
  stage_key,
  phase,
  name,
  responsible_dept,
  sort_order,
  default_due_days
)
VALUES
  ('costing_sop_logged', 'costing', 'Costing SOP Logged In', 'Sales', 10, 1),
  ('costing_shared_rd', 'costing', 'Costing Shared by R&D', 'R&D', 20, 3),
  ('costing_revision_items', 'costing', 'Costing Revision / Additional Items', 'R&D', 30, 3),
  ('costing_client_approved', 'costing', 'Costing Approved by Client', 'Sales', 40, 2),
  ('drawing_sop_logged', 'drawing', 'Drawing SOP Logged In', 'Sales', 50, 1),
  ('drawings_prepared_rd', 'drawing', 'Drawings Prepared by R&D', 'R&D', 60, 4),
  ('drawings_shared_client', 'drawing', 'Drawings Shared with Client', 'Sales', 70, 1),
  ('drawing_revision_items', 'drawing', 'Drawing Revisions / Additional Items', 'R&D', 80, 4),
  ('drawings_client_approved', 'drawing', 'Drawings Approved by Client', 'Sales', 90, 2),
  ('sample_sop_logged', 'sampling', 'Sample SOP Logged In', 'Sales', 100, 1),
  ('sample_development_started', 'sampling', 'Sample Development Started by R&D', 'R&D', 110, 2),
  ('sample_completed_rd', 'sampling', 'Sample Completed by R&D', 'R&D', 120, 5),
  ('samples_shared_client', 'sampling', 'Samples Shared with Client', 'Dispatch', 130, 2),
  ('sample_revisions_requested', 'sampling', 'Sample Revisions Requested', 'Sales', 140, 2),
  ('revised_samples_started', 'sampling', 'Revised Samples Started by R&D', 'R&D', 150, 2),
  ('revised_samples_completed', 'sampling', 'Revised Samples Completed', 'R&D', 160, 4),
  ('sample_client_approved', 'sampling', 'Sample Approved by Client', 'Sales', 170, 2),
  ('order_sop_logged_production', 'production', 'Order SOP Logged Into Production', 'Production', 180, 1),
  ('bom_ordered_production', 'production', 'BOM Ordered by Production', 'Production', 190, 2),
  ('raw_material_procurement_completed', 'production', 'Raw Material Procurement Completed', 'Procurement', 200, 4),
  ('production_started', 'production', 'Production Started', 'Production', 210, 2),
  ('production_completed', 'production', 'Production Completed', 'Production', 220, 7),
  ('qc_completed', 'production', 'QC Completed', 'QC', 230, 2),
  ('dispatch_completed', 'production', 'Dispatch Completed', 'Dispatch', 240, 2)
ON CONFLICT (stage_key) DO NOTHING;
