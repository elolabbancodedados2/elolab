import { describe, expect, it } from 'vitest';
import { getRoleAccessPreview } from '../roleAccessPreview';

describe('prévia de acesso por papéis', () => {
  it('não mostra áreas quando nenhum papel foi selecionado', () => {
    expect(getRoleAccessPreview([])).toEqual([]);
  });

  it('usa as mesmas áreas e telas que o menu oferece para a recepção', () => {
    const preview = getRoleAccessPreview(['recepcao']);
    const labels = preview.flatMap((area) => area.items);

    expect(preview.length).toBeGreaterThan(0);
    expect(labels).toContain('Agenda');
    expect(labels).toContain('Fila e triagem');
    expect(labels).not.toContain('Financeiro');
    expect(labels).not.toContain('Cobranças e assinaturas');
  });

  it('combina módulos de papéis selecionados e nunca inclui recursos da plataforma', () => {
    const areas = getRoleAccessPreview(['medico', 'financeiro']);
    const labels = areas.flatMap((area) => area.items);

    expect(labels).toContain('Prontuários');
    expect(labels).toContain('Contas a receber e a pagar');
    expect(areas.map(({ name }) => name)).toContain('Financeiro');
    expect(labels).not.toContain('Carteira de clientes');
    expect(labels).not.toContain('Segurança e privacidade');
  });

  it('mostra o menu clínico completo ao selecionar admin', () => {
    const areas = getRoleAccessPreview(['admin']);
    const labels = areas.flatMap((area) => area.items);

    expect(areas.map(({ name }) => name)).toContain('Configurações');
    expect(areas.map(({ name }) => name)).toContain('Financeiro');
    expect(labels).not.toContain('Carteira de clientes');
  });
});
