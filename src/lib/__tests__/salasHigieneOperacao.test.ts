import { describe, expect, it } from 'vitest';
import { ativosDaSala, lerCapacidade } from '@/lib/salasOperacao';
import { csvRelatorioHigiene, formatarMomento, linhasRelatorioHigiene, validarChecklist } from '@/lib/higieneSalasOperacao';

describe('salas: patrimônio e capacidade', () => {
  it('bloqueia só por equipamento marcado e fora de operação', () => {
    const ativos = [
      { id: 'a', name: 'Monitor', room_id: 's1', status: 'maintenance' as const, block_room_when_unavailable: true },
      { id: 'b', name: 'Maca', room_id: 's1', status: 'unavailable' as const, block_room_when_unavailable: false },
      { id: 'c', name: 'Antigo', room_id: 's1', status: 'retired' as const, block_room_when_unavailable: true },
      { id: 'd', name: 'Outro', room_id: 's2', status: 'maintenance' as const, block_room_when_unavailable: true },
    ];
    const r = ativosDaSala('s1', ativos);
    expect(r.daSala.map(a => a.id)).toEqual(['a', 'b']);
    expect(r.foraDeOperacao).toHaveLength(2);
    expect(r.bloqueantes.map(a => a.id)).toEqual(['a']);
  });

  it('não transforma campo vazio em 1', () => {
    expect(lerCapacidade('')).toBeNull();
    expect(lerCapacidade('0')).toBeNull();
    expect(lerCapacidade('2,5')).toBeNull();
    expect(lerCapacidade(' 4 ')).toBe(4);
  });
});

describe('higienização', () => {
  const agora = new Date('2026-11-01T17:30:00Z'); // 14:30 em São Paulo

  it('mostra data sem segundos e relativo para hoje', () => {
    expect(formatarMomento('2026-11-01T17:18:00Z', agora)).toBe('há 12 min');
    expect(formatarMomento('2026-11-01T13:03:00Z', agora)).toBe('hoje às 10:03');
    expect(formatarMomento('2026-10-30T17:03:40Z', agora)).toBe('30/10 14:03');
    expect(formatarMomento('2025-10-30T17:03:40Z', agora)).toBe('30/10/2025 14:03');
  });

  it('valida o checklist linha a linha', () => {
    const problemas = validarChecklist('Ok', 'Limpar bancada\nab\n\nTrocar lençol');
    expect(problemas.map(p => p.linha)).toEqual([null, 2]);
    expect(problemas[1].mensagem).toContain('Linha 2');
    expect(validarChecklist('Entre atendimentos', 'Limpar bancada')).toEqual([]);
  });

  it('gera o relatório do período com executor, inspetor e resultado', () => {
    const linhas = linhasRelatorioHigiene({
      execucoes: [
        { id: 'e1', room_id: 's1', started_by: 'u1', started_at: '2026-10-20T13:00:00Z', submitted_by: 'u1', submitted_at: '2026-10-20T13:20:00Z', notes: null },
        { id: 'e2', room_id: 's1', started_by: 'u1', started_at: '2026-09-01T13:00:00Z', submitted_by: null, submitted_at: null, notes: null },
      ],
      revisoes: [{ execution_id: 'e1', reviewer_id: 'u2', decision: 'rejected', note: 'Pia suja', created_at: '2026-10-20T14:00:00Z' }],
      salas: new Map([['s1', 'Consultório 1']]),
      pessoas: new Map([['u1', 'Ana'], ['u2', 'Bruno']]),
      de: '2026-10-01', ate: '2026-10-31',
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ Sala: 'Consultório 1', 'Executado por': 'Ana', Inspetor: 'Bruno', Resultado: 'Reprovada', 'Nota da inspeção': 'Pia suja' });
    expect(csvRelatorioHigiene(linhas)).toContain('"Reprovada";"Pia suja"');
  });
});
