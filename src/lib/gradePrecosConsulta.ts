/**
 * Grade Tipos de consulta × Convênios: o que mudou em relação aos preços
 * gravados. Células vazias que já não tinham preço são ignoradas; apagar um
 * preço existente não é permitido pela grade (use a tela do tipo).
 */
import { emCentavos } from '@/lib/dinheiro';

export interface PrecoGravado { id: string; tipo_consulta_id: string; convenio_id: string; valor: number }

export interface AlteracaoGrade {
  tipoId: string;
  convenioId: string;
  valor: number;
  existenteId: string | null;
}

export const chaveCelula = (tipoId: string, convenioId: string) => `${tipoId}|${convenioId}`;

export function lerValorCelula(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '');
  if (!limpo) return null;
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}

export function alteracoesGrade(
  edicoes: Readonly<Record<string, string>>,
  precos: ReadonlyArray<PrecoGravado>,
): { alteracoes: AlteracaoGrade[]; invalidas: string[] } {
  const porChave = new Map(precos.map(p => [chaveCelula(p.tipo_consulta_id, p.convenio_id), p]));
  const alteracoes: AlteracaoGrade[] = [];
  const invalidas: string[] = [];
  for (const [chave, texto] of Object.entries(edicoes)) {
    const [tipoId, convenioId] = chave.split('|');
    const atual = porChave.get(chave);
    const valor = lerValorCelula(texto);
    if (valor === null) { if (atual) invalidas.push(chave); continue; }
    if (!Number.isFinite(valor) || valor < 0) { invalidas.push(chave); continue; }
    if (atual && emCentavos(atual.valor) === emCentavos(valor)) continue;
    alteracoes.push({ tipoId, convenioId, valor, existenteId: atual?.id ?? null });
  }
  return { alteracoes, invalidas };
}

/** Nome da cópia sem repetir um nome já usado: "Retorno (cópia)", "Retorno (cópia 2)"... */
export function nomeDaCopia(nome: string, existentes: ReadonlyArray<string>): string {
  const usados = new Set(existentes.map(n => n.trim().toLocaleLowerCase('pt-BR')));
  let candidato = `${nome} (cópia)`;
  for (let i = 2; usados.has(candidato.toLocaleLowerCase('pt-BR')); i += 1) candidato = `${nome} (cópia ${i})`;
  return candidato;
}
