import { describe, expect, it } from 'vitest';
import { readDraft } from '../useRecoverableDraft';

describe('readDraft', () => {
  it('recupera somente envelopes válidos', () => {
    sessionStorage.setItem('draft', JSON.stringify({ version: 1, savedAt: '2026-08-20T00:00:00.000Z', value: { titulo: 'Ligar' } }));
    expect(readDraft<{ titulo: string }>(sessionStorage, 'draft')?.value.titulo).toBe('Ligar');
  });

  it('remove conteúdo corrompido sem quebrar o formulário', () => {
    sessionStorage.setItem('draft', '{inválido');
    expect(readDraft(sessionStorage, 'draft')).toBeNull();
    expect(sessionStorage.getItem('draft')).toBeNull();
  });
});

