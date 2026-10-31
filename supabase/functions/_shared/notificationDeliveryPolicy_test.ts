import { mensagemDeCampanha } from './notificationDeliveryPolicy.ts';

Deno.test('treats queue items created by disparar_campanha as campaign messages', () => {
  if (!mensagemDeCampanha({ tipo: 'campanha', campanha_id: '9b1c2d3e-0000-4000-8000-000000000001' })) {
    throw new Error('Expected a campaign item to require the patient preference check');
  }
});

Deno.test('ignores other queue items and malformed campaign markers', () => {
  const casos: Array<Record<string, unknown> | null | undefined> = [
    null,
    undefined,
    {},
    { tipo: 'aniversario' },
    { tipo: 'campanha' },
    { tipo: 'campanha', campanha_id: '' },
    { tipo: 'campanha', campanha_id: 42 },
    { journey: true, tipo_notificacao: 'pesquisa_satisfacao' },
  ];
  for (const caso of casos) {
    if (mensagemDeCampanha(caso)) throw new Error(`Unexpected campaign match for ${JSON.stringify(caso)}`);
  }
});
