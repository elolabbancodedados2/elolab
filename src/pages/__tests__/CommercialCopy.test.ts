import { describe, expect, it } from 'vitest';
import { mensagemRetornoCheckout } from '../Auth';
import { textoAcaoPlano } from '../Configuracoes';
import { periodoLabel } from '../PlanoCheckout';

describe('copy comercial', () => {
  it('descreve o período configurado sem duplicar o número de meses', () => {
    expect(periodoLabel(3)).toBe('3 meses');
    expect(periodoLabel(6)).toBe('6 meses');
    expect(periodoLabel(1)).toBe('mês');
  });

  it('não chama de upgrade a ação do plano Ultra atual', () => {
    expect(textoAcaoPlano('elolab-ultra')).toBe('Gerenciar plano');
    expect(textoAcaoPlano('elolab-max')).toBe('Fazer Upgrade');
  });

  it('retira a instrução obsoleta de buscar código de ativação por e-mail', () => {
    const message = mensagemRetornoCheckout('success');
    expect(message).toMatch(/acompanhar o plano/i);
    expect(message).not.toMatch(/código de ativação|verifique seu email/i);
    expect(mensagemRetornoCheckout('pending')).toMatch(/acompanhar o status do plano/i);
  });
});
