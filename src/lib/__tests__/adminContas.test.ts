import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const { chamarAdminContas, gerarSenhaTemporaria } = await import('../adminContas');

/**
 * A função recusa por vários motivos e cada mensagem diz o que fazer a seguir:
 * "digite o e-mail para confirmar", "esta conta tem registros clínicos
 * vinculados, use Bloquear". Todas viajam no CORPO de uma resposta não-2xx.
 *
 * O `functions.invoke` do supabase-js não lança nesse caso: devolve
 * `{ data: null, error }` com o corpo ainda fechado dentro de `error.context`.
 * Quem não abre esse corpo mostra "Edge Function returned a non-2xx status
 * code" — verdadeiro, inútil, e some com a única instrução que o usuário tinha.
 */
describe('chamarAdminContas', () => {
  beforeEach(() => invoke.mockReset());

  it('mostra a mensagem que a função escreveu, não a genérica do supabase-js', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: { json: async () => ({ error: 'Digite o e-mail da conta exatamente como aparece para confirmar.' }) },
      }),
    });

    await expect(chamarAdminContas({ acao: 'apagar', alvo_id: 'x' }))
      .rejects.toThrow('Digite o e-mail da conta exatamente como aparece para confirmar.');
  });

  it('quando o corpo não é JSON, mantém a mensagem original em vez de sumir com o erro', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Failed to fetch'), {
        context: { json: async () => { throw new SyntaxError('not json'); } },
      }),
    });

    await expect(chamarAdminContas({ acao: 'bloquear', alvo_id: 'x' }))
      .rejects.toThrow('Failed to fetch');
  });

  it('erro sem context nenhum ainda chega na tela', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Sessão inválida') });
    await expect(chamarAdminContas({ acao: 'bloquear', alvo_id: 'x' }))
      .rejects.toThrow('Sessão inválida');
  });

  it('200 com { error } no corpo também falha — senão a tela comemora o que não aconteceu', async () => {
    invoke.mockResolvedValue({ data: { error: 'Conta não encontrada.' }, error: null });
    await expect(chamarAdminContas({ acao: 'bloquear', alvo_id: 'x' }))
      .rejects.toThrow('Conta não encontrada.');
  });

  it('devolve o corpo quando dá certo', async () => {
    invoke.mockResolvedValue({ data: { ok: true, bloqueado: true }, error: null });
    await expect(chamarAdminContas({ acao: 'bloquear', alvo_id: 'x' }))
      .resolves.toEqual({ ok: true, bloqueado: true });
  });

  it('repassa a ação e o alvo para a função', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await chamarAdminContas({ acao: 'trocar_senha', alvo_id: 'abc', senha: 'segredo123', motivo: 'pedido' });
    expect(invoke).toHaveBeenCalledWith('admin-contas', {
      body: { acao: 'trocar_senha', alvo_id: 'abc', senha: 'segredo123', motivo: 'pedido' },
    });
  });
});

describe('gerarSenhaTemporaria', () => {
  it('passa do mínimo que a função exige', () => {
    expect(gerarSenhaTemporaria().length).toBeGreaterThanOrEqual(10);
  });

  it('sempre tem letra, número e símbolo — o Supabase recusaria uma senha fraca', () => {
    for (let i = 0; i < 50; i++) {
      const s = gerarSenhaTemporaria();
      expect(s).toMatch(/[a-zA-Z]/);
      expect(s).toMatch(/[0-9]/);
      expect(s).toMatch(/[!@#$%&*]/);
    }
  });

  it('não usa caracteres que se confundem ao ditar por telefone', () => {
    // Essa senha costuma ser passada por voz. O/0 e l/1/I viram suporte.
    for (let i = 0; i < 50; i++) {
      expect(gerarSenhaTemporaria()).not.toMatch(/[O0lI1]/);
    }
  });

  it('não repete', () => {
    const geradas = new Set(Array.from({ length: 200 }, () => gerarSenhaTemporaria()));
    expect(geradas.size).toBe(200);
  });
});
