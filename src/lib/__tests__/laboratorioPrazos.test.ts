import { describe, expect, it } from 'vitest';
import { previsaoEntrega, proximaColetaPendente, situacaoSla, slaHorasDoSetor } from '../laboratorioPrazos';

const agora = new Date('2026-11-01T12:00:00Z');
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();

describe('SLA por setor', () => {
  it('usa o limite do setor e volta ao padrão de 24 h', () => {
    const setores = [{ id: 'a', sla_alerta_horas: 4 }, { id: 'b', sla_alerta_horas: null }];
    expect(slaHorasDoSetor('a', setores)).toBe(4);
    expect(slaHorasDoSetor('b', setores)).toBe(24);
    expect(slaHorasDoSetor(null, setores)).toBe(24);
  });

  it('só conta amostras em aberto', () => {
    expect(situacaoSla({ status: 'em_analise', created_at: horasAtras(5) }, 4, agora)).toBe('estourado');
    expect(situacaoSla({ status: 'pendente', created_at: horasAtras(3) }, 4, agora)).toBe('atencao');
    expect(situacaoSla({ status: 'pendente', created_at: horasAtras(1) }, 4, agora)).toBe('ok');
    expect(situacaoSla({ status: 'liberado', created_at: horasAtras(50) }, 4, agora)).toBe('encerrado');
    expect(situacaoSla({ status: 'cancelado', created_at: horasAtras(50) }, 4, agora)).toBe('encerrado');
  });
});

describe('próxima coleta', () => {
  it('prioriza urgente e, depois, a mais antiga', () => {
    const lista = [
      { id: 'nova', status: 'pendente', urgente: false, created_at: horasAtras(1) },
      { id: 'antiga', status: 'pendente', urgente: false, created_at: horasAtras(5) },
      { id: 'urgente-nova', status: 'pendente', urgente: true, created_at: horasAtras(0.5) },
      { id: 'urgente-antiga', status: 'pendente', urgente: true, created_at: horasAtras(2) },
      { id: 'coletada', status: 'coletado', urgente: true, created_at: horasAtras(9) },
    ];
    expect(proximaColetaPendente(lista)?.id).toBe('urgente-antiga');
    expect(proximaColetaPendente(lista.filter(item => !item.urgente))?.id).toBe('antiga');
    expect(proximaColetaPendente([])).toBeNull();
  });
});

describe('previsão de entrega', () => {
  it('soma o prazo do catálogo à coleta e marca atraso só em aberto', () => {
    const coleta = { status: 'em_analise', data_coleta: horasAtras(30), created_at: horasAtras(31), exames: { tipo_exames_catalog: { tempo_estimado_horas: 24 } } };
    const previsao = previsaoEntrega(coleta, agora);
    expect(previsao?.previstoPara.toISOString()).toBe(horasAtras(6));
    expect(previsao?.atrasado).toBe(true);
    expect(previsaoEntrega({ ...coleta, status: 'liberado' }, agora)?.atrasado).toBe(false);
  });

  it('sem prazo no catálogo não inventa previsão', () => {
    expect(previsaoEntrega({ status: 'pendente', created_at: horasAtras(1), exames: { tipo_exames_catalog: null } }, agora)).toBeNull();
    expect(previsaoEntrega({ status: 'pendente', created_at: horasAtras(1), exames: { tipo_exames_catalog: [{ tempo_estimado_horas: 2 }] } }, agora)?.atrasado).toBe(false);
  });
});
