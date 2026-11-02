import { describe, expect, it } from 'vitest';
import { demonstrativoRepassesCsv, itensDoMedico, percentualBr, subtotaisPorMedico, type RepasseDemonstrativo } from '../repasseDemonstrativo';

const r = (extra: Partial<RepasseDemonstrativo>): RepasseDemonstrativo => ({
  id: 'x', medico_id: 'm1', valor_base: 100, valor_repasse: 40, percentual: 40, tipo_calculo: 'percentual',
  valor_configurado: null, status: 'pendente', medicos: { nome: 'Dra. Ana', crm: '123' }, ...extra,
});

describe('repasseDemonstrativo', () => {
  const repasses = [
    r({ id: 'a' }),
    r({ id: 'b', status: 'pago', valor_base: 200.1, valor_repasse: 80.04 }),
    r({ id: 'c', medico_id: 'm2', medicos: { nome: 'Dr. Bruno', crm: '456' }, lancamentos: { data: '2026-10-15' }, paciente_nome: 'Carla', tipo_calculo: 'fixo', valor_configurado: 50, valor_repasse: 50, valor_base: 300 }),
    r({ id: 'd', status: 'cancelado', valor_repasse: 999 }),
    r({ id: 'e', valor_repasse: 10, valor_base: 25 }),
  ];
  const valido = (item: RepasseDemonstrativo) => item.id !== 'e';

  it('soma por médico só o que conta no devido, sem cancelados', () => {
    const subtotais = subtotaisPorMedico(repasses, valido);
    expect(subtotais).toHaveLength(2);
    const ana = subtotais.find(s => s.medicoId === 'm1')!;
    const bruno = subtotais.find(s => s.medicoId === 'm2')!;
    expect(ana).toMatchObject({ nome: 'Dra. Ana', quantidade: 3, base: 300.1, devido: 120.04, pago: 80.04, emAberto: 40 });
    expect(bruno).toMatchObject({ quantidade: 1, devido: 50, pago: 0, emAberto: 50 });
  });

  it('gera o CSV com itens, regra e subtotais', () => {
    const csv = demonstrativoRepassesCsv(repasses, '2026-10', valido);
    expect(csv).toContain('"Competência 10/2026"');
    expect(csv).toContain('"Dr. Bruno";"456";"15/10/2026";"Carla";"Fixo 50,00";"300,00";"50,00";"Pendente";"Sim"');
    expect(csv).toContain('"Dra. Ana";"123";"3";"300,10";"120,04";"80,04";"40,00"');
  });
  it('mostra percentual em pt-BR, marca cancelado e ordena itens do médico por data', () => {
    expect(percentualBr(12.5)).toBe('12,5%');
    const csv = demonstrativoRepassesCsv([r({ id: 'z', status: 'cancelado', percentual: 12.5 })], '2026-10', () => true);
    expect(csv).toContain('"12,5%"');
    expect(csv).toContain('"Cancelado";"Não"');
    const itens = itensDoMedico([
      r({ id: '2', lancamentos: { data: '2026-10-20' } }),
      r({ id: '1', lancamentos: { data: '2026-10-02' } }),
      r({ id: 'x2', medico_id: 'm2' }),
    ], 'm1');
    expect(itens.map(i => i.id)).toEqual(['1', '2']);
  });
});
