import { describe, expect, it } from 'vitest';
import { prazoLegalLgpd } from '@/lib/lgpdPrazo';

describe('prazoLegalLgpd', () => {
  it('conta 15 dias corridos a partir do pedido, no calendário de São Paulo', () => {
    // 02:00 UTC do dia 2 ainda é dia 1 em São Paulo.
    const prazo = prazoLegalLgpd('2026-11-02T02:00:00Z', new Date('2026-11-05T15:00:00Z'));
    expect(prazo).toMatchObject({ limite: '2026-11-16', diasRestantes: 11, situacao: 'no_prazo' });
    expect(prazo?.texto).toBe('Prazo legal até 16/11/2026 · 11 dias');
  });

  it('avisa nos três últimos dias, no dia e depois do vencimento', () => {
    expect(prazoLegalLgpd('2026-11-01T15:00:00Z', new Date('2026-11-14T15:00:00Z'))?.situacao).toBe('vence_em_breve');
    expect(prazoLegalLgpd('2026-11-01T15:00:00Z', new Date('2026-11-16T15:00:00Z'))?.texto).toBe('Prazo legal termina hoje (16/11/2026)');
    expect(prazoLegalLgpd('2026-11-01T15:00:00Z', new Date('2026-11-18T15:00:00Z'))).toMatchObject({
      situacao: 'vencido', texto: 'Prazo legal vencido há 2 dias (16/11/2026)',
    });
  });

  it('ignora data inválida', () => {
    expect(prazoLegalLgpd('sem data')).toBeNull();
  });
});
