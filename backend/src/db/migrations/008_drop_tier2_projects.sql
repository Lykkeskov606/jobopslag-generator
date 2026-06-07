-- Pre-production cleanup: drop all Tier 2 projects so old Step 2 format doesn't linger.
-- project_inputs, project_outputs, project_members cascade via ON DELETE CASCADE.
DELETE FROM projects WHERE tier = 2;
