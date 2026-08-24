import { describe, expect, it } from 'vitest';
import { queryRootsForOperationalEvent } from '@/lib/operationalEvents';

describe('queryRootsForOperationalEvent', () => {
  it('propaga pagamento para caixa, financeiro, agenda e notificacoes', () => {
    const roots = queryRootsForOperationalEvent('lancamento');
    expect(roots).toEqual(expect.arrayContaining([
      'lancamentos', 'caixa-diario', 'contas-receber', 'agendamentos', 'central-notificacoes',
    ]));
  });

  it('propaga exame para laboratorio, coleta, paciente e cobranca', () => {
    const roots = queryRootsForOperationalEvent('exame');
    expect(roots).toEqual(expect.arrayContaining([
      'exames', 'laboratorio', 'mapa-coleta', 'pacientes', 'lancamentos',
    ]));
  });

  it('ignora agregado desconhecido com seguranca', () => {
    expect(queryRootsForOperationalEvent('desconhecido')).toEqual([]);
  });
});
