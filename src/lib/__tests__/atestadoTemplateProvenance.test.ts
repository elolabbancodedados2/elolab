import { describe, expect, it } from 'vitest';
import { atestadoTemplateVersionLabel, selectedAtestadoTemplateId } from '@/lib/atestadoTemplateProvenance';

describe('atestado template provenance', () => {
  it('keeps the selected template identity separate from its clinical content', () => {
    expect(selectedAtestadoTemplateId({
      id: 'template-1',
      nome: 'Afastamento padrão',
      conteudo: 'Texto clínico',
      cid: 'Z00.0',
      updated_at: '2026-10-14T12:30:00.000Z',
    })).toBe('template-1');
    expect(selectedAtestadoTemplateId(null)).toBeNull();
  });

  it('shows the exact revision timestamp captured on the issued document', () => {
    expect( atestadoTemplateVersionLabel({
      modelo_atestado_nome: 'Afastamento padrão',
      modelo_atestado_atualizado_em: '2026-10-14T12:30:00.000Z',
    })).toMatch(/Afastamento padrão.*14\/10\/2026/);
    expect( atestadoTemplateVersionLabel({
      modelo_atestado_nome: null,
      modelo_atestado_atualizado_em: null,
    })).toBeNull();
  });
});
