import { describe, it, expect } from 'vitest';
import { getFilteredMenuGroups } from '../sidebarMenu';

/**
 * O filtro do menu já teve dois defeitos, e nenhum aparecia em revisão de
 * código — só quando alguém clicava e recebia "sem permissão", ou não achava
 * uma tela que existia.
 *
 * 1. O filtro roda em DOIS níveis, grupo e item. Incluir um papel só no item
 *    não adianta: se o grupo não o tem, o grupo inteiro some.
 * 2. O dono da plataforma não tem papel de clínica. Tratado como usuário comum,
 *    ele via tudo — inclusive telas de clínica que abririam vazias.
 */

const nomes = (gs: ReturnType<typeof getFilteredMenuGroups>) => gs.map((g) => g.label);
const itens = (gs: ReturnType<typeof getFilteredMenuGroups>, grupo: string) =>
  gs.find((g) => g.label === grupo)?.items.map((i) => i.href) ?? [];

describe('menu do dono da plataforma', () => {
  it('sem clínica, mostra apenas o grupo Plataforma', () => {
    const g = getFilteredMenuGroups([], false, true, false);
    expect(nomes(g)).toEqual(['Plataforma']);
  });

  it('ao entrar numa clínica (impersonação), recupera as telas de clínica', () => {
    const g = getFilteredMenuGroups([], false, true, true);
    expect(nomes(g)).toContain('Pacientes');
    expect(nomes(g)).toContain('Plataforma');
  });

  it('o CRM só existe para ele', () => {
    const dono = getFilteredMenuGroups([], false, true, false);
    expect(itens(dono, 'Plataforma')).toContain('/admin/crm');
  });
});

describe('menu do administrador de clínica', () => {
  const adminClinica = () => getFilteredMenuGroups(['admin'], true, false, true);

  it('não enxerga o grupo Plataforma', () => {
    expect(nomes(adminClinica())).not.toContain('Plataforma');
  });

  it('nenhuma tela de plataforma escapa por outro grupo', () => {
    const todos = adminClinica().flatMap((g) => g.items.map((i) => i.href));
    for (const rota of ['/admin/crm', '/admin/clinicas', '/painel-admin', '/documentacao']) {
      expect(todos).not.toContain(rota);
    }
  });

  it('alcança a própria assinatura — esconder isso impediria de contratar', () => {
    const todos = adminClinica().flatMap((g) => g.items.map((i) => i.href));
    expect(todos).toContain('/planos');
  });
});

describe('filtro nos dois níveis', () => {
  it('médico enxerga a fila: o grupo E o item precisam incluí-lo', () => {
    const g = getFilteredMenuGroups(['medico'], false, false, true);
    expect(itens(g, 'Atendimento')).toContain('/fila');
  });

  it('recepção não recebe telas exclusivas de médico', () => {
    const g = getFilteredMenuGroups(['recepcao'], false, false, true);
    const todos = g.flatMap((x) => x.items.map((i) => i.href));
    expect(todos).not.toContain('/prontuarios');
  });

  it('grupo sem o papel derruba o item mesmo que o item o cite', () => {
    // Financeiro é ['admin','financeiro']; um médico não deve alcançar nada dali.
    const g = getFilteredMenuGroups(['medico'], false, false, true);
    expect(nomes(g)).not.toContain('Financeiro');
  });
});
