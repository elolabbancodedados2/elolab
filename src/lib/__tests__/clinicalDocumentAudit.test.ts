import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { registrarAcessoDocumentoClinico } from '@/lib/clinicalDocumentAudit';

describe('registrarAcessoDocumentoClinico', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envia somente tipo, ID e ação permitidos à função auditora', async () => {
    rpc.mockResolvedValue({ data: 'audit-id', error: null });
    await expect(registrarAcessoDocumentoClinico('atestado', 'document-1', 'impressao')).resolves.toBe('audit-id');
    expect(rpc).toHaveBeenCalledWith('registrar_acesso_documento_clinico', {
      p_tipo: 'atestado', p_documento_id: 'document-1', p_acao: 'impressao',
    });
  });

  it('propaga falha da auditoria para que o fluxo não prossiga sem registro', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('RLS negou a auditoria') });
    await expect(registrarAcessoDocumentoClinico('anexo_prontuario', 'document-1', 'visualizacao'))
      .rejects.toThrow('RLS negou a auditoria');
  });
});

describe('migration de auditoria clínica', () => {
  it('restringe papéis, ações e clínicas e evita gravar nome/conteúdo do paciente', () => {
    const migration = readFileSync('supabase/migrations/20261014230500_auditoria_acoes_documentos_clinicos.sql', 'utf8');
    expect(migration).toMatch(/can_access_clinical\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/is_admin\(auth\.uid\(\)\) OR public\.is_medico\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/public\.is_same_clinica\(p\.clinica_id\)/i);
    expect(migration).toMatch(/'visualizacao', 'impressao', 'exportacao'/i);
    expect(migration).toMatch(/'anexo_prontuario', 'prescricao', 'atestado', 'encaminhamento'/i);
    expect(migration).toMatch(/p_tipo \|\| ':' \|\| p_documento_id::text/i);
    expect(migration).toMatch(/jsonb_build_array\([\s\S]*?'event',[\s\S]*?'document_type'/i);
    expect(migration).not.toMatch(/record_name, changes\)[\s\S]*?p\.nome|changes\)[\s\S]*?p\.paciente/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/i);
  });
});
