-- ============================================================================
-- VERIFICAÇÃO — arquivar clínica, e excluir só a que está vazia
--
-- A trava que importa é a última: uma tela de "excluir clínica" que apaga
-- prontuário cria problema jurídico com dois cliques (CFM 1.821/07 manda
-- guardar 20 anos). Metade dos casos abaixo existe para provar que ela segura.
--
-- Termina em ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _res(n int, caso text, ok boolean, detalhe text);
GRANT ALL ON _res TO authenticated;

CREATE TEMP TABLE _ctx AS
SELECT
  (SELECT user_id FROM public.platform_admins WHERE ativo LIMIT 1)                  AS dona,
  (SELECT p.id FROM public.profiles p
     JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role::text = 'admin'
    WHERE p.clinica_id IS NOT NULL LIMIT 1)                                          AS admin_comum,
  (SELECT c.id FROM public.clinicas c
    WHERE EXISTS (SELECT 1 FROM public.pacientes x WHERE x.clinica_id = c.id) LIMIT 1) AS clinica_com_dados;

-- Clínica descartável e vazia, para o caminho feliz da exclusão.
INSERT INTO public.clinicas (nome) VALUES ('__verificacao_vazia__');
UPDATE _ctx SET clinica_com_dados = clinica_com_dados;
CREATE TEMP TABLE _vazia AS
  SELECT id, nome FROM public.clinicas WHERE nome LIKE '%__verificacao_vazia__%' LIMIT 1;
GRANT SELECT ON _ctx TO authenticated;
GRANT SELECT ON _vazia TO authenticated;

-- ─── Sessão da dona do SaaS ───
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT dona::text FROM _ctx), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 1. Contar o conteúdo de uma clínica com dados
DO $$
DECLARE v jsonb; v_c uuid;
BEGIN
  SELECT clinica_com_dados INTO v_c FROM _ctx;
  v := public.platform_conteudo_da_clinica(v_c);
  INSERT INTO _res VALUES (1, 'conta o que existe dentro da clínica',
    (v->>'vazia')::boolean = false AND (v->>'pacientes')::int > 0,
    'pacientes='||(v->>'pacientes')||' vazia='||(v->>'vazia'));
END $$;

-- 2. Excluir clínica COM dados é recusado
DO $$
DECLARE v jsonb; v_c uuid; v_nome text;
BEGIN
  SELECT clinica_com_dados INTO v_c FROM _ctx;
  SELECT nome INTO v_nome FROM public.clinicas WHERE id = v_c;
  v := public.platform_excluir_clinica_vazia(v_c, v_nome);
  INSERT INTO _res VALUES (2, 'excluir clínica com prontuário/paciente',
    (v->>'success')::boolean IS NOT TRUE, coalesce(v->>'error','APAGOU'));
END $$;

-- 3. Nome errado não exclui nem a vazia
DO $$
DECLARE v jsonb; v_id uuid;
BEGIN
  SELECT id INTO v_id FROM _vazia;
  v := public.platform_excluir_clinica_vazia(v_id, 'nome que nao e o dela');
  INSERT INTO _res VALUES (3, 'confirmação com nome errado', (v->>'success')::boolean IS NOT TRUE,
    coalesce(v->>'error','APAGOU'));
END $$;

-- 4. Arquivar guarda quem, quando e por quê
DO $$
DECLARE v jsonb; v_id uuid; v_quem uuid; v_quando timestamptz; v_motivo text; v_dona uuid;
BEGIN
  SELECT id INTO v_id FROM _vazia;
  SELECT dona INTO v_dona FROM _ctx;
  v := public.platform_arquivar_clinica(v_id, 'Cliente encerrou contrato');
  SELECT arquivada_por, arquivada_em, arquivada_motivo
    INTO v_quem, v_quando, v_motivo FROM public.clinicas WHERE id = v_id;
  INSERT INTO _res VALUES (4, 'arquivar registra quem, quando e por quê',
    (v->>'success')::boolean AND v_quem = v_dona AND v_quando IS NOT NULL AND v_motivo IS NOT NULL,
    'por='||coalesce(v_quem::text,'?')||' motivo='||coalesce(v_motivo,'-'));
END $$;

-- 5. Arquivada sai do topo da lista mas continua existindo
DO $$
DECLARE v_id uuid; v_arq boolean;
BEGIN
  SELECT id INTO v_id FROM _vazia;
  SELECT arquivada INTO v_arq FROM public.platform_get_clinicas_overview() WHERE clinica_id = v_id;
  INSERT INTO _res VALUES (5, 'a lista do painel mostra o estado de arquivada',
    v_arq IS TRUE, 'arquivada='||coalesce(v_arq::text,'ausente da lista'));
END $$;

-- 6. Desarquivar volta atrás
DO $$
DECLARE v_id uuid; v_arq boolean;
BEGIN
  SELECT id INTO v_id FROM _vazia;
  PERFORM public.platform_desarquivar_clinica(v_id);
  SELECT arquivada INTO v_arq FROM public.clinicas WHERE id = v_id;
  INSERT INTO _res VALUES (6, 'desarquivar volta atrás', v_arq IS FALSE, 'arquivada='||coalesce(v_arq::text,'nulo'));
END $$;

-- 7. Excluir a vazia, com o nome certo, funciona
DO $$
DECLARE v jsonb; v_id uuid; v_nome text; v_sobrou int;
BEGIN
  SELECT id, nome INTO v_id, v_nome FROM _vazia;
  -- O nome real tem o prefixo que o gatilho de cadastro acrescenta.
  SELECT nome INTO v_nome FROM public.clinicas WHERE id = v_id;
  v := public.platform_excluir_clinica_vazia(v_id, v_nome);
  SELECT count(*) INTO v_sobrou FROM public.clinicas WHERE id = v_id;
  INSERT INTO _res VALUES (7, 'excluir a clínica vazia com o nome certo',
    (v->>'success')::boolean IS TRUE AND v_sobrou = 0,
    coalesce(v->>'error', 'excluída; sobrou '||v_sobrou));
END $$;

RESET ROLE;

-- ─── 8. Admin comum de clínica não governa a plataforma ───
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT admin_comum::text FROM _ctx), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_c uuid;
BEGIN
  SELECT clinica_com_dados INTO v_c FROM _ctx;
  BEGIN
    PERFORM public.platform_arquivar_clinica(v_c, 'tentativa indevida');
    INSERT INTO _res VALUES (8, 'admin comum não arquiva clínica', false, 'CONSEGUIU');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (8, 'admin comum não arquiva clínica', true, SQLERRM);
  END;
END $$;

DO $$
DECLARE v_c uuid;
BEGIN
  SELECT clinica_com_dados INTO v_c FROM _ctx;
  BEGIN
    PERFORM public.platform_conteudo_da_clinica(v_c);
    INSERT INTO _res VALUES (9, 'admin comum não inspeciona outra clínica', false, 'CONSEGUIU');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _res VALUES (9, 'admin comum não inspeciona outra clínica', true, SQLERRM);
  END;
END $$;

RESET ROLE;

SELECT
  string_agg((CASE WHEN ok THEN 'OK   ' ELSE 'FALHOU ' END) || n || '. ' || caso || ' [' || left(detalhe, 62) || ']',
             E'\n' ORDER BY n) AS resultado,
  count(*) FILTER (WHERE ok) || '/' || count(*) AS placar
FROM _res;

ROLLBACK;
