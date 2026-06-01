-- Organization-ready data model (Fase: foundation, no UI yet).
-- Each user gets a personal organization on signup.
-- Solo user = organization with one member.
-- Projects carry organization_id for future team/multi-user features.

CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'owner'
                    CHECK (role IN ('owner', 'admin', 'member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON organization_members(organization_id);

-- Add organization_id to projects (nullable — filled in by migration below)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);

-- Migrate existing users: create one personal org per user, link their projects
DO $$
DECLARE
  u          RECORD;
  new_org_id UUID;
BEGIN
  FOR u IN SELECT id, email FROM users LOOP
    -- Only create org if user doesn't already have one (idempotent)
    SELECT om.organization_id INTO new_org_id
    FROM organization_members om
    WHERE om.user_id = u.id
    LIMIT 1;

    IF new_org_id IS NULL THEN
      INSERT INTO organizations (name)
      VALUES (split_part(u.email, '@', 1) || '''s workspace')
      RETURNING id INTO new_org_id;

      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (new_org_id, u.id, 'owner');
    END IF;

    -- Link all projects owned by this user (that don't have an org yet)
    UPDATE projects
    SET organization_id = new_org_id
    WHERE owner_id = u.id AND organization_id IS NULL;
  END LOOP;
END $$;
