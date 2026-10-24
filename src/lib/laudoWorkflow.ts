export function podeRetificarResultado(statusColeta: string | null | undefined, liberado: boolean): boolean {
  return liberado || statusColeta === 'validado';
}

export function deveNotificarRetificacao(liberadoAtual: boolean | null | undefined, liberadoAntes: boolean): boolean {
  return liberadoAtual ?? liberadoAntes;
}

export function perfilPodeRetificarResultado(roles: string[] | null | undefined): boolean {
  return roles?.some(role => role === 'admin' || role === 'enfermagem') ?? false;
}

type NumeroOpcional = number | string | null | undefined;
const texto = (valor: unknown) => (valor == null ? '' : String(valor).trim());

/** Intervalo de referência configurado, sempre separado do valor observado. */
export function formatarReferenciaLaudo(r: {
  valorReferenciaMin?: NumeroOpcional; valorReferenciaMax?: NumeroOpcional;
  valorReferenciaTexto?: string | null; unidade?: string | null;
}): string {
  const referenciaTexto = texto(r.valorReferenciaTexto);
  if (referenciaTexto) return referenciaTexto;
  const min = texto(r.valorReferenciaMin);
  const max = texto(r.valorReferenciaMax);
  const unidade = texto(r.unidade);
  const faixa = min && max ? `${min} a ${max}` : max ? `Até ${max}` : min ? `A partir de ${min}` : '';
  if (!faixa) return 'Não informado';
  return unidade ? `${faixa} ${unidade}` : faixa;
}

/** Método, equipamento e laboratório executor que produziram o resultado. */
export function procedenciaResultadoLaudo(r: { metodo?: string | null; equipamento?: string | null; laboratorio?: string | null }): string {
  return ([['Método', r.metodo], ['Equipamento', r.equipamento], ['Laboratório', r.laboratorio]] as const)
    .filter(([, valor]) => texto(valor))
    .map(([rotulo, valor]) => `${rotulo}: ${texto(valor)}`)
    .join(' · ');
}
