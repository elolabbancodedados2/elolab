export function anoBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/**
 * Datas de nascimento (yyyy-MM-dd) que fazem aniversário em `hoje`, cobrindo
 * `anos` anos para trás. Quem nasceu em 29/02 comemora em 28/02 nos anos
 * comuns; e 29/02 só existe nos anos bissextos.
 */
export function datasDeNascimentoQueFazemAniversario(hoje: string, anos = 111): string[] {
  const [anoHoje] = hoje.split('-').map(Number);
  const mesDia = hoje.slice(5, 10);
  const incluir29DeFevereiro = mesDia === '02-28' && !anoBissexto(anoHoje);
  const datas: string[] = [];
  for (let i = 0; i < anos; i += 1) {
    const ano = anoHoje - i;
    if (mesDia !== '02-29' || anoBissexto(ano)) datas.push(`${ano}-${mesDia}`);
    if (incluir29DeFevereiro && anoBissexto(ano)) datas.push(`${ano}-02-29`);
  }
  return datas;
}
