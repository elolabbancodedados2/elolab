import { describe, expect, it } from 'vitest';
import { filtrarRascunhosAbertos, nomeAutorRascunho } from '../prontuarioDrafts';

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

  it('identifica o autor pelo médico responsável, sem expor IDs', () => {
    expect(nomeAutorRascunho('med-2', [
      { id: 'med-1', nome: 'Dra. Outra' },
      { id: 'med-2', nome: 'Dr. João Silva' },
    ])).toBe('Dr. João Silva');
  });

  it('usa o perfil da sessão como fallback e um rótulo genérico sem autor', () => {
    expect(nomeAutorRascunho('med-3', [], 'Maria Souza')).toBe('Maria Souza');
    expect(nomeAutorRascunho(null, [], '  ')).toBe('Profissional não identificado');
  });
});
