import { describe, expect, it } from 'vitest';
import { getDashboardLinksForRoles } from '../Dashboard';

describe('atalhos do dashboard por função', () => {
  it.each([
    ['recepcao', ['/recepcao', '/agenda', '/fila'], ['/financeiro', '/prontuarios', '/configuracoes']],
    ['enfermagem', ['/triagem', '/mapa-coleta', '/laboratorio'], ['/financeiro', '/prontuarios', '/configuracoes']],
    ['financeiro', ['/financeiro', '/contas', '/cobranca-inadimplentes'], ['/pacientes', '/prontuarios', '/configuracoes']],
  ])('%s recebe somente atalhos do próprio setor', (role, permitidos, proibidos) => {
    const links = getDashboardLinksForRoles([role as string]);
    for (const link of permitidos as string[]) expect(links).toContain(link);
    for (const link of proibidos as string[]) expect(links).not.toContain(link);
  });

  it('papel clínico médico não herda atalhos administrativos', () => {
    expect(getDashboardLinksForRoles(['medico'])).toEqual([]);
  });
});
