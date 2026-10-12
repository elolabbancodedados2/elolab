type RoleCheck = (role: 'financeiro') => boolean;

export function getConveniosPermissions(isAdmin: boolean, hasRole: RoleCheck) {
  return {
    gerenciarConvenios: isAdmin,
    gerenciarTabelaExames: isAdmin || hasRole('financeiro'),
    excluirExames: isAdmin,
  };
}
