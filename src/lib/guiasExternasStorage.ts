export function pathsLaudoExternoAoFechar(
  uploadTemporario: string | readonly string[] | null | undefined,
  anexoPersistido: string | null | undefined,
): string[] {
  const paths = Array.isArray(uploadTemporario) ? uploadTemporario : [uploadTemporario];
  return paths.filter((path): path is string => !!path && path !== anexoPersistido);
}

export function pathLaudoAnteriorAposSalvar(
  anexoPersistido: string | null | undefined,
  novoAnexoPersistido: string | null | undefined,
): string | null {
  return anexoPersistido && anexoPersistido !== novoAnexoPersistido ? anexoPersistido : null;
}
