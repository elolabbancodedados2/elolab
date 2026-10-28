import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, insertMock, getUserMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({
    insert: insertMock,
    delete: vi.fn(),
  }));
  const getUserMock = vi.fn();
  return { fromMock, insertMock, getUserMock };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

import {
  deletePatientData,
  EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA,
  ExclusaoLgpdBloqueadaError,
  registrarSolicitacaoExclusaoLgpd,
} from '@/lib/lgpdCompliance';

describe('exclusão LGPD destrutiva suspensa (CLIN-QA-004)', () => {
  beforeEach(() => {
    fromMock.mockClear();
    insertMock.mockReset();
    getUserMock.mockReset();
  });

  it('fica desligada', () => {
    expect(EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA).toBe(false);
  });

  it('deletePatientData recusa sem tocar no banco', async () => {
    await expect(deletePatientData('paciente-1', 'pedido do titular')).rejects.toBeInstanceOf(ExclusaoLgpdBloqueadaError);
    expect(fromMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('o pedido vira tarefa urgente vinculada ao paciente, sem apagar nada', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const single = vi.fn().mockResolvedValue({ data: { id: 'tarefa-1' }, error: null });
    insertMock.mockReturnValue({ select: () => ({ single }) });

    const resultado = await registrarSolicitacaoExclusaoLgpd({
      pacienteId: 'paciente-1',
      pacienteNome: 'Paciente Sintético',
      clinicaId: 'clinica-1',
      motivo: '  Solicitação do titular  ',
    });

    expect(resultado).toEqual({ tarefaId: 'tarefa-1' });
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('tarefas');
    const linha = insertMock.mock.calls[0][0];
    expect(linha).toMatchObject({
      clinica_id: 'clinica-1',
      paciente_id: 'paciente-1',
      criado_por: 'user-1',
      prioridade: 'urgente',
      status: 'pendente',
    });
    expect(linha.descricao).toContain('Motivo informado: Solicitação do titular');
  });

  it('exige motivo e sessão', async () => {
    await expect(registrarSolicitacaoExclusaoLgpd({
      pacienteId: 'p', pacienteNome: 'N', clinicaId: 'c', motivo: '   ',
    })).rejects.toThrow('Informe o motivo');

    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(registrarSolicitacaoExclusaoLgpd({
      pacienteId: 'p', pacienteNome: 'N', clinicaId: 'c', motivo: 'pedido',
    })).rejects.toThrow('Sessão expirada');
    expect(insertMock).not.toHaveBeenCalled();
  });
});
