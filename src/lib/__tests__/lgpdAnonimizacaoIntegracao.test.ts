import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, from, auth: { getUser: vi.fn() }, storage: { from: vi.fn() } },
}));

import {
  ANONIMIZACAO_LGPD_HABILITADA,
  AnonimizacaoLgpdIndisponivelError,
  anonimizarPacienteLgpd,
  EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA,
} from '@/lib/lgpdCompliance';

// Dados sintéticos.
const entrada = {
  pacienteId: '11111111-1111-4111-8111-111111111111',
  clinicaId: '22222222-2222-4222-8222-222222222222',
  motivo: 'Pedido do titular, protocolo sintético 1.',
  confirmacaoNome: 'Paciente Sintético',
};

describe('integração da anonimização LGPD (CLIN-QA-004)', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('as duas travas ficam desligadas', () => {
    expect(EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA).toBe(false);
    expect(ANONIMIZACAO_LGPD_HABILITADA).toBe(false);
  });

  it('com a trava desligada recusa sem chamar o banco', async () => {
    await expect(anonimizarPacienteLgpd(entrada)).rejects.toBeInstanceOf(
      AnonimizacaoLgpdIndisponivelError
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('com a trava ligada chama só a RPC transacional, sem delete por tabela', async () => {
    rpc.mockResolvedValue({
      data: { anonimizado: false, ja_anonimizado: true, anonimizado_em: '2026-10-27T10:00:00Z' },
      error: null,
    });
    const r = await anonimizarPacienteLgpd(entrada, true);
    expect(r).toEqual({ situacao: 'ja_anonimizado', anonimizadoEm: '2026-10-27T10:00:00Z' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('lgpd_anonimizar_paciente', {
      p_paciente_id: entrada.pacienteId,
      p_clinica_id: entrada.clinicaId,
      p_motivo: entrada.motivo,
      p_confirmacao: entrada.confirmacaoNome,
    });
    expect(from).not.toHaveBeenCalled();
  });
});
