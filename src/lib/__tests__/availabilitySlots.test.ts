import { describe, expect, it, vi } from 'vitest';
import { horariosLivres, validarHorario } from '../../../supabase/functions/_shared/horarios';

type Schedule = {
  hora_inicio: string;
  hora_fim: string;
  duracao_consulta: number;
  intervalo_consultas: number;
};

function makeDb(
  schedules: Schedule[],
  appointments: Array<Record<string, string>> = [],
  scheduleError: Error | null = null,
) {
  return {
    from: vi.fn((table: string) => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        lte: vi.fn(() => query),
        gte: vi.fn(),
        not: vi.fn(),
        order: vi.fn(),
      };
      if (table === 'medico_disponibilidade') {
        let orderCalls = 0;
        query.order.mockImplementation(() => {
          orderCalls += 1;
          return orderCalls === 4
            ? Promise.resolve({ data: scheduleError ? null : schedules, error: scheduleError })
            : query;
        });
      } else if (table === 'bloqueios_agenda') {
        query.gte.mockResolvedValue({ data: [], error: null });
      } else if (table === 'agendamentos') {
        query.not.mockResolvedValue({ data: appointments, error: null });
      }
      return query;
    }),
  };
}

const mondayShifts: Schedule[] = [
  { hora_inicio: '09:00', hora_fim: '11:00', duracao_consulta: 30, intervalo_consultas: 15 },
  { hora_inicio: '13:00', hora_fim: '14:00', duracao_consulta: 30, intervalo_consultas: 0 },
];

describe('disponibilidade com mais de uma faixa no mesmo dia', () => {
  it('lista todos os horários em ordem e sem duplicar horários sobrepostos', async () => {
    const db = makeDb([
      ...mondayShifts,
      { hora_inicio: '13:00', hora_fim: '14:00', duracao_consulta: 30, intervalo_consultas: 0 },
    ]);

    await expect(horariosLivres(db, 'clinica-1', 'medico-1', '2030-06-03'))
      .resolves.toEqual(['09:00', '09:45', '10:30', '13:00', '13:30']);
  });

  it('valida consultas em uma faixa da tarde e recusa horários no intervalo entre faixas', async () => {
    const db = makeDb(mondayShifts);

    await expect(validarHorario(db, 'clinica-1', 'medico-1', '2030-06-03', '13:30'))
      .resolves.toEqual({ error: null, duration: 30 });
    await expect(validarHorario(db, 'clinica-1', 'medico-1', '2030-06-03', '12:00'))
      .resolves.toMatchObject({ error: 'O horário está fora da disponibilidade do médico.' });
  });

  it('usa a faixa sobreposta que continua livre quando outra duração do mesmo horário está ocupada', async () => {
    const shifts: Schedule[] = [
      { hora_inicio: '09:00', hora_fim: '09:45', duracao_consulta: 30, intervalo_consultas: 0 },
      { hora_inicio: '09:00', hora_fim: '10:00', duracao_consulta: 15, intervalo_consultas: 0 },
    ];
    const db = makeDb(shifts, [{ id: 'appointment-1', hora_inicio: '09:20', hora_fim: '09:45' }]);

    await expect(horariosLivres(db, 'clinica-1', 'medico-1', '2030-06-03'))
      .resolves.toContain('09:00');
    await expect(validarHorario(db, 'clinica-1', 'medico-1', '2030-06-03', '09:00'))
      .resolves.toEqual({ error: null, duration: 15 });
  });

  it('propaga falha de leitura em vez de apresentar erro de banco como agenda vazia', async () => {
    const dbError = new Error('database unavailable');
    const db = makeDb(mondayShifts, [], dbError);

    await expect(horariosLivres(db, 'clinica-1', 'medico-1', '2030-06-03'))
      .rejects.toBe(dbError);
  });
});
