/**
 * Recursos contratados no plano (ex.: `agente_ia`) são liberados pelo banco,
 * que confere a clínica, o dono, o estado e a vigência da assinatura e a
 * inadimplência recorrente. A interface também esconde o recurso, mas só esta
 * checagem vale como garantia. Exige client com service role.
 */
export async function recursoDoPlanoLiberado(
  // deno-lint-ignore no-explicit-any
  service: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> },
  clinicaId: string,
  recurso: string,
): Promise<boolean> {
  const { data, error } = await service.rpc('clinica_recurso_plano_liberado', {
    p_clinica_id: clinicaId,
    p_recurso: recurso,
  });
  if (error) throw new Error('Não foi possível validar o plano contratado da clínica. Tente novamente.');
  return data === true;
}
