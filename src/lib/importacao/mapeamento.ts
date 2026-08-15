/**
 * Adivinha qual coluna da planilha é qual campo do cadastro.
 *
 * A pessoa que está migrando não sabe o que é "logradouro" nem quer aprender.
 * O sistema chuta, mostra o chute, e ela corrige o que ficou errado. Um chute
 * bom transforma vinte escolhas em duas conferidas.
 *
 * Regra dos empates: cada campo fica com no máximo uma coluna, e cada coluna
 * com no máximo um campo — o par de maior pontuação leva. Sem isso, "telefone"
 * e "telefone 2" disputariam o mesmo campo e o resultado dependeria da ordem
 * das colunas no arquivo.
 */
import { CAMPOS_PACIENTE, normalizarCabecalho, type Campo, type NomeDoCampo } from './campos';

/** Coluna da planilha → campo do cadastro. `null` = não importar esta coluna. */
export type Mapeamento = Record<number, NomeDoCampo | null>;

/**
 * 100 = cabeçalho idêntico a um apelido conhecido
 *  80 = apelido contido no cabeçalho ("nome do paciente completo")
 *  60 = cabeçalho contido no apelido
 *   0 = não parece
 */
export function pontuar(cabecalho: string, campo: Campo): number {
  const c = normalizarCabecalho(cabecalho);
  if (!c) return 0;

  for (const apelido of campo.apelidos) {
    if (c === apelido) return 100;
  }
  for (const apelido of campo.apelidos) {
    // Comparação por palavra inteira: "num" não pode casar dentro de "numero
    // da carteirinha", senão o número do endereço rouba a carteirinha.
    const palavras = c.split(' ');
    const alvo = apelido.split(' ');
    const contem = alvo.every(p => palavras.includes(p));
    if (contem) return 80;
  }
  for (const apelido of campo.apelidos) {
    if (apelido.split(' ').includes(c)) return 60;
  }
  return 0;
}

export function mapearAutomaticamente(
  cabecalhos: string[],
  campos: Campo[] = CAMPOS_PACIENTE,
): Mapeamento {
  const candidatos: Array<{ coluna: number; campo: NomeDoCampo; nota: number }> = [];

  cabecalhos.forEach((cabecalho, coluna) => {
    for (const campo of campos) {
      const nota = pontuar(cabecalho, campo);
      if (nota > 0) candidatos.push({ coluna, campo: campo.nome, nota });
    }
  });

  // Maior nota primeiro; empate resolvido pela ordem da coluna, para o
  // resultado ser o mesmo toda vez que o mesmo arquivo for aberto.
  candidatos.sort((a, b) => b.nota - a.nota || a.coluna - b.coluna);

  const mapeamento: Mapeamento = {};
  const camposUsados = new Set<NomeDoCampo>();
  const colunasUsadas = new Set<number>();

  for (const c of candidatos) {
    if (camposUsados.has(c.campo) || colunasUsadas.has(c.coluna)) continue;
    mapeamento[c.coluna] = c.campo;
    camposUsados.add(c.campo);
    colunasUsadas.add(c.coluna);
  }

  cabecalhos.forEach((_, coluna) => {
    if (!(coluna in mapeamento)) mapeamento[coluna] = null;
  });

  return mapeamento;
}

/** Campos obrigatórios que ficaram sem coluna. */
export function faltandoObrigatorios(
  mapeamento: Mapeamento,
  campos: Campo[] = CAMPOS_PACIENTE,
): string[] {
  const usados = new Set(Object.values(mapeamento).filter(Boolean));
  return campos.filter(c => c.obrigatorio && !usados.has(c.nome)).map(c => c.rotulo);
}
