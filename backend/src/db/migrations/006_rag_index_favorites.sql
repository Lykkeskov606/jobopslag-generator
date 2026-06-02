-- Fase 3: HNSW index for fast vector similarity search on rag_sources
-- Uses cosine distance which matches the <=> operator used in queries.
-- Conditional (WHERE embedding IS NOT NULL) so un-seeded rows don't block the index.
CREATE INDEX IF NOT EXISTS idx_rag_sources_embedding
  ON rag_sources USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Favorites table (v1.5 UI — data model prepared in v1)
CREATE TABLE IF NOT EXISTS favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  output_id    UUID REFERENCES project_outputs(id) ON DELETE SET NULL,
  favorited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, output_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
