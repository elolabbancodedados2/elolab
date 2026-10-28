import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const remove = vi.fn();
const from = vi.fn(() => ({ remove: (...args: unknown[]) => remove(...args) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    storage: { from: (...args: unknown[]) => from(...(args as [])) },
  },
}));

const { anonimizarPaciente, AnonimizacaoLgpdError, BUCKET_FOTOS_PACIENTE } = await import(
  '../lgpdAnonimizacao'
);

// Dados sintéticos.
const PACIENTE = '11111111-1111-4111-8111-111111111111';
const CLINICA = '22222222-2222-4222-8222-222222222222';
const entrada = {
  pacienteId: PACIENTE,
  clinicaId: CLINICA,
  motivo: 'Pedido do titular em 27/10, protocolo 123.',
  confirmacaoNome: 'Maria Teste da Silva',
};

const contagens = {
  guias_externas: 1,
  tarefas: 2,
  portal_tokens: 1,
  lista_espera: 0,
  whatsapp_conversas: 0,
  auditoria: 3,
};

function sucesso(pendencias: { foto_url: string | null; whatsapp_conversas: number }) {
  return {
    data: {
      anonimizado: true,
      ja_anonimizado: false,
      log_id: 'log-1',
      rotulo: 'Paciente anonimizado 11111111',
      contagens,
      pendencias,
    },
    error: null,
  };
}

describe('anonimizarPaciente', () => {
  beforeEach(() => {
    rpc.mockReset();
    remove.mockReset();
    from.mockClear();
  });

  it('valida a entrada antes de chamar o banco', async () => {
    await expect(anonimizarPaciente({ ...entrada, pacienteId: 'abc' })).rejects.toMatchObject({
      codigo: 'LGPD_ENTRADA_INVALIDA',
      message: 'Paciente inválido.',
    });
    await expect(anonimizarPaciente({ ...entrada, motivo: '  curto  ' })).rejects.toMatchObject({
      codigo: 'LGPD_ENTRADA_INVALIDA',
    });
    await expect(anonimizarPaciente({ ...entrada, confirmacaoNome: '   ' })).rejects.toBeInstanceOf(
      AnonimizacaoLgpdError
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('chama a função transacional com os parâmetros normalizados', async () => {
    rpc.mockResolvedValue(sucesso({ foto_url: null, whatsapp_conversas: 0 }));

    const r = await anonimizarPaciente({ ...entrada, motivo: `  ${entrada.motivo}  ` });

    expect(rpc).toHaveBeenCalledWith('lgpd_anonimizar_paciente', {
      p_paciente_id: PACIENTE,
      p_clinica_id: CLINICA,
      p_motivo: entrada.motivo,
      p_confirmacao: entrada.confirmacaoNome,
    });
    expect(r).toEqual({
      situacao: 'anonimizado',
      logId: 'log-1',
      rotulo: 'Paciente anonimizado 11111111',
      contagens,
      pendencias: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('remove a foto do Storage depois do commit', async () => {
    rpc.mockResolvedValue(sucesso({ foto_url: 'clinica/foto.jpg', whatsapp_conversas: 0 }));
    remove.mockResolvedValue({ data: [], error: null });

    const r = await anonimizarPaciente(entrada);

    expect(from).toHaveBeenCalledWith(BUCKET_FOTOS_PACIENTE);
    expect(remove).toHaveBeenCalledWith(['clinica/foto.jpg']);
    expect(r.situacao === 'anonimizado' && r.pendencias).toEqual([]);
  });

  it('não esconde falha na foto nem conversas de WhatsApp: viram pendências', async () => {
    rpc.mockResolvedValue(sucesso({ foto_url: 'clinica/foto.jpg', whatsapp_conversas: 2 }));
    remove.mockResolvedValue({ data: null, error: { message: 'storage indisponível' } });

    const r = await anonimizarPaciente(entrada);

    expect(r.situacao).toBe('anonimizado');
    if (r.situacao !== 'anonimizado') return;
    expect(r.pendencias).toHaveLength(2);
    expect(r.pendencias[0]).toMatch(/foto/);
    expect(r.pendencias[1]).toMatch(/2 conversa\(s\) de WhatsApp/);
  });

  it('segunda chamada informa que já estava anonimizado', async () => {
    rpc.mockResolvedValue({
      data: { anonimizado: false, ja_anonimizado: true, anonimizado_em: '2026-10-27T12:00:00Z' },
      error: null,
    });

    await expect(anonimizarPaciente(entrada)).resolves.toEqual({
      situacao: 'ja_anonimizado',
      anonimizadoEm: '2026-10-27T12:00:00Z',
    });
  });

  it.each([
    ['LGPD_SEM_PERMISSAO', '42501', /administrador/],
    ['LGPD_CONFIRMACAO_NAO_CONFERE', '22023', /nome digitado/],
    ['LGPD_AGENDAMENTO_ATIVO', '55000', /agendamento futuro/],
    ['LGPD_PACIENTE_NAO_ENCONTRADO', 'P0002', /não encontrado/],
  ])('traduz o código %s devolvido pelo banco', async (hint, code, texto) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code, hint, message: 'texto cru do Postgres' },
    });

    const erro = await anonimizarPaciente(entrada).catch((e) => e);
    expect(erro).toBeInstanceOf(AnonimizacaoLgpdError);
    expect(erro.codigo).toBe(hint);
    expect(erro.message).toMatch(texto);
    expect(erro.message).not.toMatch(/Postgres/);
  });

  it('erro desconhecido não vaza texto do banco', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'detalhe interno' } });
    await expect(anonimizarPaciente(entrada)).rejects.toMatchObject({
      codigo: 'LGPD_FALHA',
      message: expect.stringMatching(/Nenhum dado foi alterado/),
    });
  });

  it('recusa resposta fora do contrato', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(anonimizarPaciente(entrada)).rejects.toMatchObject({
      codigo: 'LGPD_RESPOSTA_INVALIDA',
    });
  });
});

describe('migration 20261028100000_lgpd_anonimizacao_transacional', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql'),
    'utf8'
  );
  const corpo = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.lgpd_anonimizar_paciente'));

  it('é SECURITY DEFINER com search_path fixo e fechada para anon', () => {
    expect(corpo).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.lgpd_anonimizar_paciente\(uuid, uuid, text, text\) FROM PUBLIC, anon;/
    );
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.lgpd_anonimizar_paciente\(uuid, uuid, text, text\) TO authenticated;/);
    expect(sql).not.toMatch(/TO\s+[^;]*\banon\b[^;]*;/i);
  });

  it('confere sessão, administrador e clínica antes de ler o paciente', () => {
    const autorizacao = corpo.search(/NOT public\.is_admin\(v_user\) OR NOT public\.is_same_clinica\(p_clinica_id\)/);
    const leitura = corpo.search(/SELECT \* INTO v_pac/);
    expect(corpo).toMatch(/IF v_user IS NULL THEN/);
    expect(autorizacao).toBeGreaterThan(0);
    expect(leitura).toBeGreaterThan(autorizacao);
    expect(corpo).toMatch(/WHERE id = p_paciente_id\s+AND clinica_id = p_clinica_id\s+FOR UPDATE/);
  });

  it('exige confirmação do nome e recusa atendimento em aberto', () => {
    expect(corpo).toMatch(/LGPD_CONFIRMACAO_NAO_CONFERE/);
    expect(corpo).toMatch(/LGPD_AGENDAMENTO_ATIVO/);
  });

  it('não apaga nem altera prontuário, exames, prescrições ou financeiro', () => {
    for (const tabela of [
      'prontuarios',
      'prescricoes',
      'exames',
      'anexos_prontuario',
      'resultados_laboratorio',
      'lancamentos',
      'pagamentos_mercadopago',
    ]) {
      expect(corpo).not.toMatch(new RegExp(`(UPDATE|DELETE FROM)\\s+public\\.${tabela}\\b`));
    }
    expect(corpo).not.toMatch(/DELETE FROM public\.pacientes/);
  });

  it('é idempotente e registra a operação no log', () => {
    expect(corpo).toMatch(/IF v_pac\.anonimizado_em IS NOT NULL THEN\s+RETURN/);
    expect(corpo).toMatch(/INSERT INTO public\.lgpd_deletion_log[\s\S]*'anonimizacao'/);
  });

  it('redige os valores antigos que a auditoria gravou do cadastro', () => {
    expect(corpo).toMatch(/UPDATE public\.audit_log[\s\S]*WHERE l\.collection = 'pacientes'\s+AND l\.record_id = p_paciente_id/);
  });
});
