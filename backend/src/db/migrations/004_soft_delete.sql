-- Soft delete: projects are flagged with deleted_at instead of hard-deleted.
-- Permanent deletion happens after 7 days (enforced in application layer).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects(deleted_at)
  WHERE deleted_at IS NOT NULL;
