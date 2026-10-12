import { describe, expect, it } from 'vitest';
import { filtrarRascunhosAbertos } from '../prontuarioDrafts';

describe('fila de rascunhos de prontuário', () => {
  it('mostra somente rascunhos do médico autenticado e ordena os mais recentes primeiro', () => {
    const result = filtrarRascunhosAbertos([
      { id: 'old', medico_id: 'med-1', assinado: false, updated_at: '2026-10-09T12:00:00Z' },
      { id: 'signed', medico_id: 'med-1', assinado: true, updated_at: '2026-10-11T12:00:00Z' },
      { id: 'other-doctor', medico_id: 'med-2', assinado: false, updated_at: '2026-10-12T12:00:00Z' },
      { id: 'new', medico_id: 'med-1', assinado: false, updated_at: '2026-10-10T12:00:00Z' },
    ], 'med-1');

    expect(result.map(item => item.id)).toEqual(['new', 'old']);
  });

  it('não expõe rascunhos se o profissional ainda não foi identificado', () => {
    expect(filtrarRascunhosAbertos([
      { id: 'draft', medico_id: 'med-1', assinado: false, updated_at: '2026-10-10T12:00:00Z' },
    ], null)).toEqual([]);
  });
});
