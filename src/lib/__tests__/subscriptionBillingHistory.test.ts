import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { descreverEventoCobranca } from '../subscriptionBillingHistory';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const configuracoes = read('src/pages/Configuracoes.tsx');
const migration = read('supabase/migrations/20261024141000_historico_cobranca_assinatura.sql').replace(/--.*$/gm, '');

describe('histórico de cobrança da assinatura EloLab', () => {
  it('não mistura o financeiro clínico de pacientes no histórico da assinatura', () => {
    expect(configuracoes).not.toContain("from('pagamentos_mercadopago')");
    expect(configuracoes).toContain("rpc('historico_cobranca_assinatura'");
    expect(migration).not.toMatch(/pagamentos_mercadopago|lancamentos/);
  });

  it('expõe só campos seguros de cada tentativa, sem dados de cartão ou do provedor', () => {
    expect(migration).not.toMatch(/card_token|payer_email|gateway_snapshot|qr_code|payload/);
    expect(migration).toMatch(/checkout_type' = 'preapproval_card'/);
  });

  it('descreve cada tentativa com o estado final', () => {
    expect(descreverEventoCobranca({ origem: 'cartao_assinatura', status: 'cancelada', detalhe: 'recusado' }))
      .toEqual({ tipo: 'Assinatura no cartão', estado: 'Cancelada', final: true, detalhe: 'Cartão recusado' });
    expect(descreverEventoCobranca({ origem: 'cartao_assinatura', status: 'pendente', detalhe: 'falha_comunicacao' }))
      .toEqual({ tipo: 'Assinatura no cartão', estado: 'Pendente', final: false, detalhe: 'Sem resposta do Mercado Pago' });
    expect(descreverEventoCobranca({ origem: 'pix_periodo', status: 'pago', detalhe: null }))
      .toEqual({ tipo: 'Pix (período)', estado: 'Pago', final: true, detalhe: null });
    expect(descreverEventoCobranca({ origem: 'fatura_recorrente', status: 'approved', detalhe: 'accredited' }).estado).toBe('Pago');
  });
});
