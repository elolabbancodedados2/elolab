import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const endpoint = readFileSync('supabase/functions/clinic-integrations/index.ts', 'utf8');
const sync = readFileSync('supabase/functions/_shared/mercadoPagoPointOrders.ts', 'utf8');
const helpers = readFileSync('supabase/functions/_shared/integracoes.ts', 'utf8');
const ui = readFileSync('src/components/configuracoes/IntegracoesClinica.tsx', 'utf8');

describe('saúde das integrações da clínica', () => {
  it('retorna status e data da última comunicação sem detalhes brutos do provedor', () => {
    expect(endpoint).toMatch(/ultimo_teste_em/);
    expect(endpoint).toMatch(/ultimo_erro:\s*conexao\.status\s*===\s*'erro'[\s\S]{0,220}\?/);
    expect(endpoint).not.toMatch(/conexoes:\s*data\s*\?\?\s*\[\]/);
  });

  it('registra o resultado da sincronização e usa diagnóstico genérico sem copiar resposta externa', () => {
    expect(sync).toMatch(/registrarResultado[\s\S]{0,250}Falha ao comunicar com o Mercado Pago/);
    expect(sync).toMatch(/registrarResultado\(service, local\.clinica_id, 'mercado_pago', null\)/);
    expect(helpers).toContain('Falha ao comunicar com o provedor. Confira a conexão ou contate o suporte.');
    expect(helpers).not.toMatch(/ultimo_erro:\s*erro\.slice/);
  });

  it('mostra saúde e última sincronização sem renderizar dica de credencial', () => {
    expect(ui).toContain('ultimo_teste_em');
    expect(ui).toMatch(/Última sincronização/);
    expect(ui).toMatch(/c\.status === 'erro'/);
    expect(ui).not.toContain('c.segredo_dica');
    expect(ui).not.toContain('c.ultimo_erro}');
  });
});
