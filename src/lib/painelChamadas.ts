const chaveStorage = (clinicaId: string) => `elolab:painel-tv:chamadas-anunciadas:${clinicaId}`;

/** Uma chamada = linha da fila + instante da gravação; rechamar gera chave nova. */
export function chaveChamada(item: { id: string; updated_at: string | null; horario_chegada: string }): string {
  return `${item.id}:${item.updated_at || item.horario_chegada}`;
}

/** Chamadas já anunciadas por este navegador; vazio se o armazenamento falhar. */
export function lerChamadasAnunciadas(clinicaId: string): Set<string> {
  try {
    const valor = JSON.parse(localStorage.getItem(chaveStorage(clinicaId)) ?? '[]');
    return new Set(Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

export function salvarChamadasAnunciadas(clinicaId: string, chaves: Iterable<string>): void {
  try {
    localStorage.setItem(chaveStorage(clinicaId), JSON.stringify([...chaves]));
  } catch {
    // Armazenamento bloqueado: o painel segue anunciando, só perde a memória na recarga.
  }
}

const FEMININOS = new Set(['sala', 'recepção', 'recepcao', 'triagem', 'enfermaria', 'área', 'area', 'unidade', 'clínica', 'clinica', 'farmácia', 'farmacia', 'coleta', 'mesa', 'cabine']);
const MASCULINOS = new Set(['consultório', 'consultorio', 'guichê', 'guiche', 'laboratório', 'laboratorio', 'box', 'setor', 'posto', 'ambulatório', 'ambulatorio', 'centro', 'balcão', 'balcao', 'caixa', 'leito', 'atendimento']);

/**
 * Frase falada pelo painel. O artigo sai da primeira palavra do nome da sala
 * ("à Sala 2", "ao Consultório 1"); quando não dá para saber o gênero, a
 * frase dispensa a preposição em vez de arriscar "à Consultório".
 */
export function fraseChamada(senha: string, salaNome: string): string {
  const nome = salaNome.trim() || 'Recepção';
  const primeira = nome.split(/\s+/)[0].toLocaleLowerCase('pt-BR');
  if (FEMININOS.has(primeira)) return `Senha ${senha}, por favor dirija-se à ${nome}.`;
  if (MASCULINOS.has(primeira)) return `Senha ${senha}, por favor dirija-se ao ${nome}.`;
  return `Senha ${senha}. Local: ${nome}.`;
}

export interface FiltroPainel {
  salaIds: Set<string>;
  setores: Set<string>;
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR');

/** Lê `?salas=id1,id2` e `?setor=triagem,consultorio` da URL do painel. */
export function lerFiltroPainel(search: string): FiltroPainel | null {
  const params = new URLSearchParams(search);
  const lista = (chave: string) => (params.get(chave) ?? '').split(',').map(item => item.trim()).filter(Boolean);
  const salaIds = new Set(lista('salas'));
  const setores = new Set(lista('setor').map(normalizar));
  return salaIds.size || setores.size ? { salaIds, setores } : null;
}

/** A sala passa no filtro pelo id ou pelo setor/tipo cadastrado. */
export function salaNoFiltro(
  filtro: FiltroPainel | null,
  sala: { id: string; tipo?: string | null; setor?: string | null } | null | undefined,
): boolean {
  if (!filtro) return true;
  if (!sala) return false;
  if (filtro.salaIds.has(sala.id)) return true;
  return [sala.tipo, sala.setor].some(valor => valor && filtro.setores.has(normalizar(valor)));
}

export interface ChamadaRecente {
  chave: string;
  senha: string;
  sala: string;
  em: string;
}

const chaveRecentes = (clinicaId: string) => `elolab:painel-tv:ultimas-chamadas:${clinicaId}`;

/** Últimas chamadas mostradas na TV, mais recente primeiro e sem repetir a mesma chamada. */
export function registrarChamadaRecente(lista: ChamadaRecente[], nova: ChamadaRecente, limite = 5): ChamadaRecente[] {
  return [nova, ...lista.filter(item => item.chave !== nova.chave)].slice(0, limite);
}

export function lerChamadasRecentes(clinicaId: string, hoje: string): ChamadaRecente[] {
  try {
    const valor = JSON.parse(localStorage.getItem(chaveRecentes(clinicaId)) ?? '{}');
    return valor?.dia === hoje && Array.isArray(valor.itens) ? valor.itens.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function salvarChamadasRecentes(clinicaId: string, hoje: string, itens: ChamadaRecente[]): void {
  try {
    localStorage.setItem(chaveRecentes(clinicaId), JSON.stringify({ dia: hoje, itens }));
  } catch {
    // Sem armazenamento, a coluna recomeça vazia na recarga.
  }
}
