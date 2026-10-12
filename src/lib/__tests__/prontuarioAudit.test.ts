import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { autorizarLeituraHistoricoMedico, autorizarLeituraHistoricoPaciente, registrarAcessoProntuario, registrarAdendoProntuario, registrarExportacaoProntuarios, registrarVisualizacaoHistoricoProntuarios } from '@/lib/prontuarioAudit';

describe('registro seguro do prontuário', () => {
  beforeEach(() => rpc.mockReset());

  it('registra acesso pela função do servidor com justificativa', async () => {
    rpc.mockResolvedValue({ data: 'acesso-1', error: null });

    await expect(registrarAcessoProntuario('prontuario-1', 'edicao', 'Ajuste autorizado'))
      .resolves.toBe('acesso-1');

    expect(rpc).toHaveBeenCalledWith('registrar_prontuario_acesso', {
      p_prontuario_id: 'prontuario-1',
      p_acao: 'edicao',
      p_justificativa: 'Ajuste autorizado',
    });
  });

  it('envia adendo sem aceitar autoria ou hash do cliente', async () => {
    rpc.mockResolvedValue({ data: { id: 'adendo-1', hash: 'server-hash' }, error: null });

    await expect(registrarAdendoProntuario('prontuario-1', 'complemento', 'Contexto', 'Texto clínico'))
      .resolves.toEqual({ id: 'adendo-1', hash: 'server-hash' });

    expect(rpc).toHaveBeenCalledWith('registrar_prontuario_adendo', {
      p_prontuario_id: 'prontuario-1',
      p_tipo: 'complemento',
      p_motivo: 'Contexto',
      p_texto: 'Texto clínico',
    });
  });

  it('propaga a falha da gravação de auditoria', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('auditoria indisponível') });

    await expect(registrarAcessoProntuario('prontuario-1', 'visualizacao'))
      .rejects.toThrow('auditoria indisponível');
  });

  it('logs export once for each unique encounter with its format', async () => {
    rpc.mockResolvedValue({ data: 'access-export', error: null });

    await registrarExportacaoProntuarios(['record-1', 'record-1', 'record-2'], 'FHIR R4 JSON');

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('registrar_prontuario_acesso', {
      p_prontuario_id: 'record-1',
      p_acao: 'exportacao',
      p_justificativa: 'Formato: FHIR R4 JSON',
    });
  });

  it('registra leituras do histórico em lote e remove IDs duplicados', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await registrarVisualizacaoHistoricoProntuarios(['record-1', 'record-1', 'record-2']);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('registrar_visualizacao_historico_prontuarios', {
      p_prontuario_ids: ['record-1', 'record-2'],
    });
  });

  it('propaga falha ao registrar leituras do histórico', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('audit unavailable') });
    await expect(registrarVisualizacaoHistoricoProntuarios(['record-1']))
      .rejects.toThrow('audit unavailable');
  });

  it('falha de forma fechada se o servidor não confirmar todos os registros do lote', async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    await expect(registrarVisualizacaoHistoricoProntuarios(['record-1']))
      .rejects.toThrow('Nem todos os acessos ao histórico foram registrados');
  });

  it('bounds concurrent audit writes when exporting a long history', async () => {
    let active = 0;
    let maxActive = 0;
    rpc.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 0));
      active -= 1;
      return { data: 'logged', error: null };
    });

    await registrarExportacaoProntuarios(Array.from({ length: 45 }, (_, index) => `record-${index}`), 'XML clínico simplificado');

    expect(rpc).toHaveBeenCalledTimes(45);
    expect(maxActive).toBeLessThanOrEqual(20);
  });

  it('autoriza a leitura do historico do paciente antes da consulta', async () => {
    rpc.mockResolvedValue({ data: 4, error: null });
    await expect(autorizarLeituraHistoricoPaciente('paciente-1')).resolves.toBe(4);
    expect(rpc).toHaveBeenCalledWith('registrar_visualizacao_historico_paciente', { p_paciente_id: 'paciente-1' });
  });

  it('autoriza a leitura do historico do medico antes da consulta', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(autorizarLeituraHistoricoMedico('medico-1')).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith('registrar_visualizacao_historico_medico', { p_medico_id: 'medico-1' });
  });
});
