import { describe, expect, it } from 'vitest';
import { getFilteredMenuGroups } from '../sidebarMenu';

type Role = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro';

const rotas = (role: Role) =>
  getFilteredMenuGroups([role], role === 'admin', false, true)
    .flatMap((grupo) => grupo.items.map((item) => item.href));

describe('matriz operacional do menu por perfil', () => {
  const casos = [
    { role: 'admin' as const, permitidas: ['/equipe', '/configuracoes', '/financeiro', '/prontuarios'], negadas: ['/painel-admin', '/admin/clinicas'] },
    { role: 'medico' as const, permitidas: ['/fila', '/prontuarios', '/documentos-clinicos', '/exames'], negadas: ['/financeiro', '/equipe', '/configuracoes'] },
    { role: 'recepcao' as const, permitidas: ['/recepcao', '/pacientes', '/retornos', '/convenios'], negadas: ['/prontuarios', '/financeiro', '/equipe'] },
    { role: 'enfermagem' as const, permitidas: ['/fila', '/pacientes', '/mapa-coleta', '/estoque'], negadas: ['/prontuarios', '/financeiro', '/equipe'] },
    { role: 'financeiro' as const, permitidas: ['/recepcao', '/financeiro', '/contas', '/relatorios'], negadas: ['/pacientes', '/prontuarios', '/equipe'] },
  ];

  for (const caso of casos) {
    it(`${caso.role}: exibe somente atalhos compatíveis com o papel`, () => {
      const menu = rotas(caso.role);
      for (const rota of caso.permitidas) expect(menu, `faltou ${rota}`).toContain(rota);
      for (const rota of caso.negadas) expect(menu, `vazou ${rota}`).not.toContain(rota);
    });
  }

  it('assinante admin não recebe nenhum item da plataforma', () => {
    const menu = getFilteredMenuGroups(['admin'], true, false, true);
    expect(menu.some((grupo) => grupo.superAdminOnly)).toBe(false);
    expect(menu.flatMap((grupo) => grupo.items).some((item) => item.superAdminOnly)).toBe(false);
  });

  it('dono da plataforma sem clínica recebe somente ferramentas da plataforma', () => {
    const menu = getFilteredMenuGroups([], false, true, false);
    expect(menu.length).toBeGreaterThan(0);
    expect(menu.every((grupo) => grupo.superAdminOnly)).toBe(true);
    expect(menu.flatMap((grupo) => grupo.items).every((item) => item.superAdminOnly)).toBe(true);
  });
});
