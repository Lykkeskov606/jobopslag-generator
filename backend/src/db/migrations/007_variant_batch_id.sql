-- Add generation_batch UUID to project_outputs so A+B variants from the same
-- generation run share a key and can be grouped as a history batch.
-- Nullable: existing rows without a batch are grouped by generated_at second.
ALTER TABLE project_outputs ADD COLUMN IF NOT EXISTS generation_batch UUID;
CREATE INDEX IF NOT EXISTS idx_project_outputs_batch ON project_outputs(generation_batch);
