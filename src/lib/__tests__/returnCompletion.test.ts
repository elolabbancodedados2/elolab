import { describe, expect, it } from 'vitest';
import { podeMarcarRetornoRealizado } from '../returnCompletion';

describe('conclusão de retorno vinculado a agendamento', () => {
  it.each(['finalizado', 'atendimento_finalizado'])('permite após o atendimento %s', (status) => {
    expect(podeMarcarRetornoRealizado(status)).toBe(true);
  });

  it.each(['agendado', 'confirmado', 'aguardando', 'em_atendimento', 'cancelado', 'faltou', null, undefined])(
    'não permite enquanto o agendamento está em %s',
    (status) => expect(podeMarcarRetornoRealizado(status)).toBe(false),
  );
});
