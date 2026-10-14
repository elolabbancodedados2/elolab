-- Base de conhecimento opcional para respostas operacionais do agente WhatsApp.
-- Armazena apenas conteúdo geral da clínica; nunca histórico ou prontuário de paciente.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Chave composta para impedir que um documento associe agente e clínica distintos.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_agents_id_clinica_id_uidx
  ON public.whatsapp_agents (id, clinica_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_agent_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  titulo text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 160),
  conteudo text NOT NULL CHECK (length(btrim(conteudo)) BETWEEN 1 AND 12000),
  embedding extensions.vector(1536) NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese'::regconfig, coalesce(titulo, '') || ' ' || coalesce(conteudo, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_agent_knowledge_agent_clinic_fk
    FOREIGN KEY (agent_id, clinica_id)
    REFERENCES public.whatsapp_agents(id, clinica_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS whatsapp_agent_knowledge_tenant_agent_idx
  ON public.whatsapp_agent_knowledge (clinica_id, agent_id);
CREATE INDEX IF NOT EXISTS whatsapp_agent_knowledge_search_idx
  ON public.whatsapp_agent_knowledge USING gin (search_vector);
CREATE INDEX IF NOT EXISTS whatsapp_agent_knowledge_embedding_idx
  ON public.whatsapp_agent_knowledge USING hnsw (embedding extensions.vector_cosine_ops);

DROP TRIGGER IF EXISTS update_whatsapp_agent_knowledge_updated_at ON public.whatsapp_agent_knowledge;
CREATE TRIGGER update_whatsapp_agent_knowledge_updated_at
  BEFORE UPDATE ON public.whatsapp_agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_agent_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_agent_knowledge_admin_select ON public.whatsapp_agent_knowledge;
DROP POLICY IF EXISTS whatsapp_agent_knowledge_admin_insert ON public.whatsapp_agent_knowledge;
DROP POLICY IF EXISTS whatsapp_agent_knowledge_admin_update ON public.whatsapp_agent_knowledge;
DROP POLICY IF EXISTS whatsapp_agent_knowledge_admin_delete ON public.whatsapp_agent_knowledge;

CREATE POLICY whatsapp_agent_knowledge_admin_select
  ON public.whatsapp_agent_knowledge FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_agents a
      WHERE a.id = whatsapp_agent_knowledge.agent_id
        AND a.clinica_id = whatsapp_agent_knowledge.clinica_id
    )
  );
CREATE POLICY whatsapp_agent_knowledge_admin_insert
  ON public.whatsapp_agent_knowledge FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_agents a
      WHERE a.id = whatsapp_agent_knowledge.agent_id
        AND a.clinica_id = whatsapp_agent_knowledge.clinica_id
    )
  );
CREATE POLICY whatsapp_agent_knowledge_admin_update
  ON public.whatsapp_agent_knowledge FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_agents a
      WHERE a.id = whatsapp_agent_knowledge.agent_id
        AND a.clinica_id = whatsapp_agent_knowledge.clinica_id
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_agents a
      WHERE a.id = whatsapp_agent_knowledge.agent_id
        AND a.clinica_id = whatsapp_agent_knowledge.clinica_id
    )
  );
CREATE POLICY whatsapp_agent_knowledge_admin_delete
  ON public.whatsapp_agent_knowledge FOR DELETE TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND clinica_id = public.get_my_clinica_id()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_agents a
      WHERE a.id = whatsapp_agent_knowledge.agent_id
        AND a.clinica_id = whatsapp_agent_knowledge.clinica_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_agent_knowledge TO authenticated;
GRANT ALL ON public.whatsapp_agent_knowledge TO service_role;
REVOKE ALL ON public.whatsapp_agent_knowledge FROM anon;

CREATE OR REPLACE FUNCTION public.search_whatsapp_agent_knowledge(
  _clinica_id uuid,
  _agent_id uuid,
  _query_embedding extensions.vector(1536),
  _query_text text,
  _match_count integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  titulo text,
  conteudo text,
  similaridade real,
  rank_score double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $$
  WITH input AS (
    SELECT websearch_to_tsquery('portuguese'::regconfig, left(coalesce(_query_text, ''), 2000)) AS query
  ), dense AS (
    SELECT k.id, row_number() OVER (ORDER BY k.embedding <=> _query_embedding) AS position,
           (1 - (k.embedding <=> _query_embedding))::real AS similarity
    FROM public.whatsapp_agent_knowledge k
    JOIN public.whatsapp_agents a ON a.id = k.agent_id AND a.clinica_id = k.clinica_id
    WHERE k.clinica_id = _clinica_id AND k.agent_id = _agent_id
      AND k.embedding IS NOT NULL
      AND (k.embedding <=> _query_embedding) <= 0.55
    ORDER BY k.embedding <=> _query_embedding
    LIMIT greatest(1, least(coalesce(_match_count, 5), 10))
  ), lexical AS (
    SELECT k.id, row_number() OVER (ORDER BY ts_rank_cd(k.search_vector, i.query) DESC) AS position,
           0::real AS similarity
    FROM public.whatsapp_agent_knowledge k
    JOIN public.whatsapp_agents a ON a.id = k.agent_id AND a.clinica_id = k.clinica_id
    CROSS JOIN input i
    WHERE k.clinica_id = _clinica_id AND k.agent_id = _agent_id
      AND numnode(i.query) > 0 AND k.search_vector @@ i.query
    ORDER BY ts_rank_cd(k.search_vector, i.query) DESC
    LIMIT greatest(1, least(coalesce(_match_count, 5), 10))
  ), combined AS (
    SELECT id, position, similarity, 1.0 / (60 + position) AS score FROM dense
    UNION ALL
    SELECT id, position, similarity, 1.0 / (60 + position) AS score FROM lexical
  ), ranked AS (
    SELECT c.id, max(c.similarity) AS similarity, sum(c.score) AS score
    FROM combined c GROUP BY c.id
  )
  SELECT k.id, k.titulo, k.conteudo, r.similarity, r.score
  FROM ranked r
  JOIN public.whatsapp_agent_knowledge k ON k.id = r.id
  WHERE k.clinica_id = _clinica_id AND k.agent_id = _agent_id
  ORDER BY r.score DESC, r.similarity DESC
  LIMIT greatest(1, least(coalesce(_match_count, 5), 10));
$$;

REVOKE ALL ON FUNCTION public.search_whatsapp_agent_knowledge(uuid, uuid, extensions.vector, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_whatsapp_agent_knowledge(uuid, uuid, extensions.vector, text, integer) TO service_role;

COMMENT ON TABLE public.whatsapp_agent_knowledge IS
  'Conteúdo operacional geral para busca híbrida do agente WhatsApp; não armazenar dados de pacientes.';

NOTIFY pgrst, 'reload schema';
