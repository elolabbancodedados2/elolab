export const parseResultadoNumerico = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^[-+]?(?:\d[\d\s.,]*|\.\d+)/);
  if (!match) return null;
  const token = match[0].replace(/\s/g, '');
  const ultimaVirgula = token.lastIndexOf(',');
  const ultimoPonto = token.lastIndexOf('.');
  let normalizado = token;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    normalizado = ultimaVirgula > ultimoPonto
      ? token.replace(/\./g, '').replace(',', '.')
      : token.replace(/,/g, '');
  } else if (ultimaVirgula >= 0) {
    normalizado = token.replace(/,/g, (_virgula, offset) => offset === ultimaVirgula ? '.' : '');
  }
  const parsed = Number(normalizado);
  return Number.isFinite(parsed) ? parsed : null;
};

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

type SnapshotResultado = Record<string, unknown>;
const simNao = (valor: unknown) => (valor === true ? 'sim' : 'não');

/** Descreve o que mudou de um snapshot de resultado para o seguinte. */
export function alteracoesDaVersao(anterior: SnapshotResultado, posterior: SnapshotResultado): string[] {
  const valor = (r: SnapshotResultado) => [texto(r.resultado), texto(r.unidade)].filter(Boolean).join(' ') || '—';
  const referencia = (r: SnapshotResultado) => formatarReferenciaLaudo({
    valorReferenciaMin: r.valor_referencia_min as NumeroOpcional, valorReferenciaMax: r.valor_referencia_max as NumeroOpcional,
    valorReferenciaTexto: r.valor_referencia_texto as string | null, unidade: r.unidade as string | null,
  });
  const campos: Array<[string, (r: SnapshotResultado) => string]> = [
    ['Resultado', valor],
    ['Referência', referencia],
    ['Método', r => texto(r.metodo) || '—'],
    ['Equipamento', r => texto(r.equipamento) || '—'],
    ['Crítico', r => simNao(r.critico)],
    ['Liberado', r => simNao(r.liberado)],
  ];
  const alteracoes = campos
    .filter(([, ler]) => ler(anterior) !== ler(posterior))
    .map(([rotulo, ler]) => `${rotulo}: ${ler(anterior)} → ${ler(posterior)}`);
  if (!anterior.validado_por && posterior.validado_por) alteracoes.push('Conferência técnica registrada');
  return alteracoes;
}

/** Cada versão guarda o estado anterior; compara com a versão seguinte ou com o registro atual. */
export function trilhaDeVersoes<V extends { numero_versao: number; registro_anterior: SnapshotResultado | null }>(
  versoes: V[], atual: SnapshotResultado,
): Array<V & { alteracoes: string[] }> {
  const porNumero = new Map(versoes.map(versao => [versao.numero_versao, versao.registro_anterior ?? {}]));
  return versoes.map(versao => ({
    ...versao,
    alteracoes: alteracoesDaVersao(versao.registro_anterior ?? {}, porNumero.get(versao.numero_versao + 1) ?? atual),
  }));
}

/** Método, equipamento e laboratório executor que produziram o resultado. */
export function procedenciaResultadoLaudo(r: { metodo?: string | null; equipamento?: string | null; laboratorio?: string | null }): string {
  return ([['Método', r.metodo], ['Equipamento', r.equipamento], ['Laboratório', r.laboratorio]] as const)
    .filter(([, valor]) => texto(valor))
    .map(([rotulo, valor]) => `${rotulo}: ${texto(valor)}`)
    .join(' · ');
}
