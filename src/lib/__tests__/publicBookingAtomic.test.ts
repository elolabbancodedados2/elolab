import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cadastroPedidoOnline } from '../../../supabase/functions/_shared/publicBookingRequest';

it('exige aceite explícito e encaminha só os dados permitidos à transação', () => {
  expect(() => cadastroPedidoOnline({ aceite_lgpd: 'sim' }, 'ip')).toThrow(/aceitar/);
  expect(cadastroPedidoOnline({ aceite_lgpd: true, nome: ' Ana  Silva ', cpf: '123.456.789-09', telefone: '(11) 99999-9999', email: ' A@B.COM ', paciente_id: 'outro' }, 'ip'))
    .toEqual({ nome: 'Ana Silva', cpf: '12345678909', telefone: '(11) 99999-9999', email: 'a@b.com', data_nascimento: null,
      aceite_lgpd: true, versao_termo: 'agendamento-online-2026-11-02', ip_aceite: 'ip' });
});
it('edge envia o pedido inteiro a uma RPC sem gravar ficha ou aceite separadamente', () => {
  const edge = readFileSync('supabase/functions/public-booking/index.ts', 'utf8');
  expect(edge).toContain("rpc('solicitar_agendamento_online_atomico'");
  expect(edge).not.toContain("from('consentimentos_lgpd').insert");
  expect(edge).not.toContain("from('pacientes').insert");
});
