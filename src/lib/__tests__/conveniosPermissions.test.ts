import { describe, expect, it } from 'vitest';
import { getConveniosPermissions } from '@/lib/conveniosPermissions';

describe('permissões do módulo Convênios', () => {
  it('permite recepção consultar, sem oferecer operações bloqueadas pelo RLS', () => {
    expect(getConveniosPermissions(false, () => false)).toEqual({
      gerenciarConvenios: false,
      gerenciarTabelaExames: false,
      excluirExames: false,
    });
  });

  it('permite financeiro gerenciar a tabela de exames, mas não excluir itens', () => {
    expect(getConveniosPermissions(false, role => role === 'financeiro')).toEqual({
      gerenciarConvenios: false,
      gerenciarTabelaExames: true,
      excluirExames: false,
    });
  });

  it('permite administração gerenciar convênios e todos os itens da tabela', () => {
    expect(getConveniosPermissions(true, () => false)).toEqual({
      gerenciarConvenios: true,
      gerenciarTabelaExames: true,
      excluirExames: true,
    });
  });
});
