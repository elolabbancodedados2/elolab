import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapearUsoPlano } from '../planUsage';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261024140000_recursos_e_uso_do_plano.sql'), 'utf8');

describe('uso do plano verificado no servidor', () => {
  it('calcula a cota restante e os bloqueios a partir da resposta do servidor', () => {
    const uso = mapearUsoPlano({
      verificado_em: '2026-10-24T13:00:00Z',
      plano_nome: 'EloLab Pro',
      recursos: [
        { chave: 'funcionarios', rotulo: 'Funcionários ativos', usado: 9, limite: 10 },
        { chave: 'medicos', rotulo: 'Médicos ativos', usado: 3, limite: 3 },
        { chave: 'recepcao', rotulo: 'Recepção', usado: 1, limite: 2 },
      ],
    });

    expect(uso.verificadoEm).toBe('2026-10-24T13:00:00Z');
    expect(uso.recursos.map((r) => r.restante)).toEqual([1, 0, 1]);
    expect(uso.canAdd).toEqual({ medico: false, funcionario: true });
    expect(uso.max_funcionarios_total).toBe(10);
    expect(uso.current).toEqual({ medicos: 3, funcionarios_total: 9 });
  });

  it('sem plano vigente não promete vagas que o servidor recusaria', () => {
    const uso = mapearUsoPlano({
      verificado_em: '2026-10-24T13:00:00Z',
      plano_nome: null,
      recursos: [{ chave: 'funcionarios', rotulo: 'Funcionários ativos', usado: 2, limite: null }],
    });

    expect(uso.plano_nome).toBeNull();
    expect(uso.recursos[0].restante).toBeNull();
    expect(uso.canAdd).toEqual({ medico: false, funcionario: false });
  });

  it('a liberação de recurso no servidor confere assinatura vigente, inadimplência e o recurso do plano', () => {
    expect(migration).toMatch(/ap\.status IN \('ativa', 'trial'\)/);
    expect(migration).toMatch(/platform_plan_recurring_payment_overdue\(c\.owner_id\)/);
    expect(migration).toMatch(/v\.features \? p_recurso/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.clinica_recurso_plano_liberado\(uuid, text\) TO service_role/);
    expect(migration).not.toMatch(/clinica_recurso_plano_liberado\(uuid, text\) TO authenticated/);
  });
});
