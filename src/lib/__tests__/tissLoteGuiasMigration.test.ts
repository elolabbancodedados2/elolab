import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261024130000_guias_e_validacao_lote_tiss.sql'), 'utf8');

describe('migration das guias e validação do lote TISS', () => {
  it('cria a tabela de guias de forma idempotente, com RLS e sem gravação direta', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.lote_tiss_guias/);
    expect(sql).toMatch(/UNIQUE \(lote_id, numero_guia\)/);
    expect(sql).toMatch(/ALTER TABLE public\.lote_tiss_guias ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.lote_tiss_guias FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON public\.lote_tiss_guias TO authenticated/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*lote_tiss_guias TO authenticated/);
  });

  it('só altera guias de lote em rascunho da clínica e com acesso financeiro', () => {
    for (const fn of ['adicionar_guia_lote_tiss', 'remover_guia_lote_tiss']) {
      const corpo = sql.split(`FUNCTION public.${fn}`)[1].split('$$;')[0];
      expect(corpo).toMatch(/can_access_financial\(auth\.uid\(\)\)/);
      expect(corpo).toMatch(/status = 'rascunho'/);
      expect(corpo).toMatch(/clinica_id = v_clinica/);
    }
  });

  it('verifica autorizado x faturado e recusa envio de lote com guias pendentes', () => {
    const pendencias = sql.split('FUNCTION public.pendencias_lote_tiss')[1].split('$$;')[0];
    for (const campo of ['registro_ans', 'quantidade_guias', 'valor_apresentado', 'codigo_procedimento', 'autorizacao_status', 'autorizacao_convenio', 'tipo_servico']) {
      expect(pendencias).toContain(`'${campo}'`);
    }
    const envio = sql.split('FUNCTION public.registrar_envio_lote_tiss')[1].split('$$;')[0];
    expect(envio).toMatch(/pendencias_lote_tiss\(p_lote_id\)/);
    expect(envio).toMatch(/RAISE EXCEPTION 'O lote tem % pendência/);
    expect(envio).toMatch(/status = 'rascunho'/);
  });
});
