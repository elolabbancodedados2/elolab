import { attachPortalPreparationInstructions } from './portalAppointmentPreparation.ts';

Deno.test('instruções de preparo só para agendamentos ativos de hoje em diante', () => {
  const appointments = [
    { id: 'future', data: '2026-10-15', tipo: 'Consulta Inicial', status: 'confirmado' },
    { id: 'today', data: '2026-10-14', tipo: 'retorno', status: 'agendado' },
    { id: 'cancelled', data: '2026-10-15', tipo: 'Consulta Inicial', status: 'cancelado' },
    { id: 'past', data: '2026-10-13', tipo: 'Consulta Inicial', status: 'finalizado' },
  ];
  const tipos = [
    { nome: 'consulta inicial', instrucoes_preparo: 'Traga seus exames anteriores.' },
    { nome: 'retorno', instrucoes_preparo: '  ' },
  ];
  const r = attachPortalPreparationInstructions(appointments, tipos, '2026-10-14');
  const esperado = ['Traga seus exames anteriores.', null, null, null];
  r.forEach((a, i) => {
    if (a.instrucoes_preparo !== esperado[i]) throw new Error(`${a.id}: ${a.instrucoes_preparo}`);
    if (a.id !== appointments[i].id) throw new Error('deve preservar os campos');
  });
});

Deno.test('o módulo não importa nada fora de supabase/functions (B9)', async () => {
  const fonte = await Deno.readTextFile(new URL('./portalAppointmentPreparation.ts', import.meta.url));
  if (/^\s*import\s/m.test(fonte)) throw new Error('não deve ter imports');
  const portal = await Deno.readTextFile(new URL('../patient-portal/index.ts', import.meta.url));
  if (/from ['"]\.\.\/\.\.\/\.\.\//.test(portal)) throw new Error('patient-portal não deve importar fora de supabase/functions');
});
