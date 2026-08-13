import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseDateOnly, todayDateOnly, toDateOnly, daysBetweenDateOnly } from '@/lib/dateOnly';

/**
 * Estes testes existem por causa de um bug real: colunas DATE do Postgres
 * chegam como "2026-07-27" e `new Date(...)` as interpreta como UTC. Em
 * America/Sao_Paulo (UTC-3) a data exibida caía para 26/07/2026 — atestado,
 * vencimento e data de nascimento apareciam com um dia a menos.
 */
describe('parseDateOnly', () => {
  it('preserva o dia de uma coluna DATE (o bug original)', () => {
    const d = parseDateOnly('2026-07-27');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // julho
    expect(d.getDate()).toBe(27); // com new Date() puro daria 26 em UTC-3
  });

  it('ancora ao meio-dia, longe da virada do dia', () => {
    expect(parseDateOnly('2026-01-01').getHours()).toBe(12);
  });

  it('preserva o dia na virada do ano', () => {
    const d = parseDateOnly('2026-01-01');
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
  });

  it('não altera valores que já trazem hora', () => {
    const iso = '2026-07-27T23:30:00Z';
    expect(parseDateOnly(iso).toISOString()).toBe(new Date(iso).toISOString());
  });

  it('devolve null para vazio, null e undefined', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly('')).toBeNull();
  });
});

describe('todayDateOnly', () => {
  it('usa o fuso local, não UTC', () => {
    const hoje = new Date();
    const esperado = [
      hoje.getFullYear(),
      String(hoje.getMonth() + 1).padStart(2, '0'),
      String(hoje.getDate()).padStart(2, '0'),
    ].join('-');
    expect(todayDateOnly()).toBe(esperado);
  });

  it('resulta em formato YYYY-MM-DD', () => {
    expect(todayDateOnly()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * O caixa da clínica quebrava aqui. `toISOString().split('T')[0]` devolve o dia
 * em UTC; das 21h à meia-noite no Brasil (UTC−3) isso já é o dia seguinte.
 * A recepcionista ia fechar o caixa às 21h e a tela dizia que não havia caixa
 * aberto, porque procurava pela data de amanhã. Estes testes congelam o relógio
 * no horário em que o bug aparece.
 */
describe('a virada de dia em UTC não afeta a data local', () => {
  afterEach(() => vi.useRealTimers());

  /** 12/08/2026 às 22h no fuso local, seja qual for o fuso da máquina. */
  const noiteLocal = new Date(2026, 7, 12, 22, 0, 0);

  it('às 22h ainda é hoje, não amanhã', () => {
    vi.useFakeTimers();
    vi.setSystemTime(noiteLocal);
    expect(todayDateOnly()).toBe('2026-08-12');
  });

  it('às 23h59 ainda é hoje', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 23, 59, 59));
    expect(todayDateOnly()).toBe('2026-08-12');
  });

  it('vira o dia só à meia-noite local', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 13, 0, 0, 1));
    expect(todayDateOnly()).toBe('2026-08-13');
  });

  it('atravessa a virada do mês pela hora local', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 31, 22, 30, 0));
    expect(todayDateOnly()).toBe('2026-08-31');
  });

  it('atravessa a virada do ano pela hora local', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 0, 0));
    expect(todayDateOnly()).toBe('2026-12-31');
  });
});

describe('toDateOnly', () => {
  it('formata uma data qualquer no fuso local', () => {
    expect(toDateOnly(new Date(2026, 7, 12, 22, 0, 0))).toBe('2026-08-12');
  });

  it('preenche mês e dia com zero à esquerda', () => {
    expect(toDateOnly(new Date(2026, 0, 5, 22, 0, 0))).toBe('2026-01-05');
  });

  it('é o que todayDateOnly usa por baixo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 22, 0, 0));
    expect(todayDateOnly()).toBe(toDateOnly(new Date(2026, 7, 12, 22, 0, 0)));
    vi.useRealTimers();
  });
});

describe('daysBetweenDateOnly', () => {
  it('conta dias inteiros', () => {
    expect(daysBetweenDateOnly('2026-07-01', '2026-07-08')).toBe(7);
  });

  it('devolve negativo quando o fim é anterior', () => {
    expect(daysBetweenDateOnly('2026-07-08', '2026-07-01')).toBe(-7);
  });

  it('é zero para a mesma data', () => {
    expect(daysBetweenDateOnly('2026-07-27', '2026-07-27')).toBe(0);
  });

  it('atravessa mudança de horário de verão sem perder um dia', () => {
    // Brasil não usa mais DST, mas o cálculo precisa ser robusto de qualquer forma
    expect(daysBetweenDateOnly('2026-02-14', '2026-02-22')).toBe(8);
  });
});
