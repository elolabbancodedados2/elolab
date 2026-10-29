import { describe, expect, it } from 'vitest';
import {
  currentFinanceMonth,
  formatFinanceMonth,
  normalizeFinanceRouteParams,
  parseFinanceMonth,
  parseFinanceOverviewTab,
} from '@/lib/financeRouteState';

describe('estado de rota do financeiro', () => {
  it('interpreta e formata um mês válido sem deslocar o dia', () => {
    const month = parseFinanceMonth('2025-02');
    expect(month).not.toBeNull();
    expect(month?.getFullYear()).toBe(2025);
    expect(month?.getMonth()).toBe(1);
    expect(month?.getDate()).toBe(1);
    expect(formatFinanceMonth(month!)).toBe('2025-02');
  });

  it.each([null, '', '2025-00', '2025-13', '25-02', '2025/02'])('rejeita mês inválido: %s', value => {
    expect(parseFinanceMonth(value)).toBeNull();
  });

  it('normaliza mês inválido para o mês atual da clínica sem apagar outros parâmetros', () => {
    const params = normalizeFinanceRouteParams(
      new URLSearchParams('mes=2025-13&tab=dre&origem=dashboard'),
      new Date('2025-06-15T12:00:00-03:00'),
      true,
    );

    expect(params.get('mes')).toBe('2025-06');
    expect(params.get('tab')).toBe('dre');
    expect(params.get('origem')).toBe('dashboard');
  });

  it('rejeita abas desconhecidas e mantém as três abas existentes', () => {
    expect(parseFinanceOverviewTab('dre')).toBe('dre');
    expect(parseFinanceOverviewTab('categorias')).toBe('categorias');
    expect(parseFinanceOverviewTab('outro')).toBe('resumo');
  });

  it('usa o mês da data atual no fuso da clínica quando a URL não informa um mês', () => {
    const month = currentFinanceMonth(new Date('2025-06-01T01:30:00Z'));
    expect(formatFinanceMonth(month)).toBe('2025-05');
  });
});
