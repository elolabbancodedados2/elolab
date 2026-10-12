export interface PerfilPermissaoTemplateEmail {
  role?: string | null;
  roles?: readonly string[] | null;
}

export function podeGerenciarTemplatesEmail(perfil: PerfilPermissaoTemplateEmail | null | undefined): boolean {
  return perfil?.role === 'admin' || perfil?.roles?.includes('admin') === true;
}
