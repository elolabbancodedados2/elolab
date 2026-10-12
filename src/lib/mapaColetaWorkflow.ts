export function dadosTransicaoColeta(
  status: string,
  profileId: string | null | undefined,
  instant = new Date(),
): Record<string, unknown> {
  if (status !== 'coletado') return { status };
  return {
    status,
    data_coleta: instant.toISOString(),
    ...(profileId ? { coletado_por: profileId } : {}),
  };
}
