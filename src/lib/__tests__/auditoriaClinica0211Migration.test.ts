import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ler = (nome: string) => readFileSync(`supabase/migrations/${nome}`, 'utf8');

describe('trava de triagem e finalização (20261102300000)', () => {
  const sql = ler('20261102300000_trava_triagem_e_finalizacao.sql');

  it('trata desligar exige_triagem como liberação excepcional', () => {
    expect(sql).toMatch(/COALESCE\(OLD\.exige_triagem, true\) AND NOT COALESCE\(NEW\.exige_triagem, true\)/);
    expect(sql).toMatch(/UPDATE OF liberado_sem_pagamento, liberado_sem_triagem, exige_triagem/);
  });

  it('tira pago → finalizado e exige a flag da RPC em em_atendimento → finalizado', () => {
    const pago = sql.match(/WHEN 'pago' THEN ARRAY\[[^\]]*\]/)?.[0] ?? '';
    expect(pago).not.toMatch(/'finalizado'|'atendimento_finalizado'/);
    expect(pago).toContain("'aguardando_pagamento_adicional'");
    expect(sql).toMatch(/OLD\.status::text = 'em_atendimento'\s+AND NEW\.status::text IN \('finalizado', 'atendimento_finalizado'\)\s+AND current_setting\('elolab\.finalizando', true\) IS DISTINCT FROM 'on'/);
    expect(sql).toMatch(/WHEN 'aguardando_pagamento_adicional' THEN ARRAY\['pago', 'finalizado', 'atendimento_finalizado'\]/);
  });

  it('liga a flag dentro de finalizar_atendimento_atomico antes de gravar o status', () => {
    expect(sql).toMatch(/PERFORM set_config\('elolab\.finalizando', 'on', true\);\s+UPDATE public\.agendamentos\s+SET status = v_status/);
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.finalizar_atendimento_atomico(uuid, uuid, boolean, integer, text) TO authenticated');
  });
});

describe('atestado imutável (20261102301000)', () => {
  const sql = ler('20261102301000_atestado_imutavel_apos_emissao.sql');

  it('bloqueia conteúdo e datas no UPDATE e remove a policy de DELETE', () => {
    for (const coluna of ['dias', 'cid', 'motivo', 'observacoes', 'data_emissao', 'data_inicio', 'data_fim']) {
      expect(sql).toContain(`NEW.${coluna} IS DISTINCT FROM OLD.${coluna}`);
    }
    expect(sql).toMatch(/BEFORE UPDATE ON public\.atestados/);
    expect(sql).toContain('DROP POLICY IF EXISTS "atestados_delete_scoped" ON public.atestados;');
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR DELETE/);
  });
});

describe('lista de espera sem vaga passada (20261102302000)', () => {
  const sql = ler('20261102302000_lista_espera_nao_aceita_vaga_passada.sql');

  it('recusa vaga cujo início já passou em São Paulo', () => {
    expect(sql).toMatch(/\(origem\.data \+ origem\.hora_inicio\) <= \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)/);
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.aceitar_oferta_lista_espera(uuid,uuid) TO service_role;');
  });
});
