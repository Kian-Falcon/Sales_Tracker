ALTER TABLE project_documents
  DROP CONSTRAINT IF EXISTS project_documents_document_type_check;

ALTER TABLE project_documents
  ADD CONSTRAINT project_documents_document_type_check
  CHECK (document_type IN ('boq', 'costing_boq', 'attachment'));
